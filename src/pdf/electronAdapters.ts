import {
    ElectronPdfExporter,
    type PdfExportRequest,
    type PdfExporter,
    type PdfFileWriter,
    type PdfPrintBackend,
    type PdfSaveDialog,
} from "./PdfExporter";

/**
 * electronAdapters — the Electron-only half of the local PDF export (issue #75).
 *
 * Verified on SiYuan 3.8.4 / Electron 44.4.1 before writing this:
 *  - a hidden BrowserWindow created through @electron/remote can be printed by SiYuan's own
 *    `siyuan-get printToPDF` command (it looks the window up by webContents id),
 *  - `preferCSSPageSize` makes the PDF page follow the `@page` size the renderer sets,
 *  - BroadcastChannel is a usable host↔window channel (same kernel origin),
 *  - destroying the window leaves no window behind.
 */

/** Matches client/pdfExportPageBridge.js. */
const CHANNEL_NAME = "siyuan-drawio-pdf-export";
/** A page that never reports readiness is a broken install, not a slow diagram. */
const RENDER_READY_TIMEOUT_MS = 15_000;

export type HiddenWindowPdfBackendOptions = {
    /** Same-origin URL of the plugin's export page, e.g. /plugins/<name>/webapp/pdf-export.html */
    exportPageUrl: string;
    channelName?: string;
    readyTimeoutMs?: number;
};

/** Parameters upstream js/export.js reads from its `render` message. */
function toRenderArgs(request: PdfExportRequest, extras: Record<string, unknown>): Record<string, unknown> {
    return {
        format: "pdf",
        xml: request.xml,
        fileTitle: request.title,
        allPages: request.allPages ? "1" : undefined,
        from: request.from,
        to: request.to,
        pageId: request.pageId,
        scale: request.scale,
        border: request.border,
        bg: request.bg,
        pageMargin: request.pageMargin,
        crop: request.crop ? "1" : undefined,
        fit: request.fit ? "1" : undefined,
        w: request.w,
        h: request.h,
        dpi: request.dpi,
        extras: JSON.stringify(extras),
    };
}

type RenderInfo = { bounds?: string; pageCount?: number } | null;

export class HiddenWindowPdfBackend implements PdfPrintBackend {
    private win: any = null;
    private channel: BroadcastChannel | null = null;

    constructor(private readonly options: HiddenWindowPdfBackendOptions) {}

    async renderAndPrint(request: PdfExportRequest): Promise<Uint8Array> {
        const remote = require("@electron/remote");
        const { ipcRenderer } = require("electron");

        this.destroy();

        const channelName = this.options.channelName ?? CHANNEL_NAME;
        const channel = new BroadcastChannel(channelName);
        this.channel = channel;

        const win = new remote.BrowserWindow({
            show: false,
            width: 1200,
            height: 900,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                backgroundThrottling: false,
            },
        });
        this.win = win;

        // drawio's export page only renders locally when the user agent announces the desktop
        // build (see mxIsElectron in upstream export.js): it wants a ` draw.io/` token *and* the
        // ` Electron/` one browsers/Electron already send. Without it the page would POST the
        // diagram to the public conversion service this feature replaces.
        win.webContents.userAgent = ` draw.io/plugin ${navigator.userAgent}`;

        let readyTimer: ReturnType<typeof setTimeout> | undefined;
        let readySeen = false;

        const outcome = new Promise<RenderInfo>((resolve, reject) => {
            channel.addEventListener("message", (event: MessageEvent) => {
                const data = event.data as { action?: string; payload?: unknown } | null;

                if (data?.action === "ready") {
                    // The page reports readiness once upstream export.js is listening.
                    readySeen = true;
                    channel.postMessage({
                        action: "render",
                        payload: toRenderArgs(request, request.extras ?? { globalVars: {} }),
                    });
                } else if (data?.action === "render-finished") {
                    resolve((data.payload ?? null) as RenderInfo);
                } else if (data?.action === "export-error") {
                    reject(new Error(`PDF 渲染失败：${String(data.payload ?? "未知错误")}`));
                }
            });
        });

        // A page that never becomes ready is a broken install, not a slow diagram, so it gets
        // its own short budget on top of the exporter's overall timeout.
        const readyDeadline = new Promise<never>((_, reject) => {
            readyTimer = setTimeout(() => {
                if (!readySeen) {
                    reject(
                        new Error(
                            `PDF 导出超时：导出页 ${this.options.readyTimeoutMs ?? RENDER_READY_TIMEOUT_MS}ms 内未就绪`,
                        ),
                    );
                }
            }, this.options.readyTimeoutMs ?? RENDER_READY_TIMEOUT_MS);
        });

        try {
            const loaded = win.loadURL(this.options.exportPageUrl);
            const info = await Promise.race([
                (async () => {
                    await loaded;
                    return outcome;
                })(),
                readyDeadline,
            ]);

            if (info == null) {
                throw new Error("PDF 渲染失败：导出页没有返回页面信息");
            }

            const pdf = await ipcRenderer.invoke("siyuan-get", {
                cmd: "printToPDF",
                webContentsId: win.webContents.id,
                // The renderer paginates with CSS; an explicit pageSize would fight with it.
                pdfOptions: { preferCSSPageSize: true, printBackground: true },
            });

            return pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
        } finally {
            clearTimeout(readyTimer);
        }
    }

    destroy(): void {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        if (this.win) {
            try {
                if (!this.win.isDestroyed()) {
                    this.win.destroy();
                }
            } finally {
                this.win = null;
            }
        }
    }
}

/** SiYuan's main process owns the native save dialog; asking it keeps the plugin dialog-free. */
export class SiYuanSaveDialog implements PdfSaveDialog {
    async pick(defaultName: string): Promise<string | null> {
        const { ipcRenderer } = require("electron");
        const result = await ipcRenderer.invoke("siyuan-get", {
            cmd: "showSaveDialog",
            title: "导出 PDF",
            defaultPath: defaultName,
            filters: [{ name: "PDF", extensions: ["pdf"] }],
        });

        return result?.canceled || !result?.filePath ? null : result.filePath;
    }
}

export const writeFileToDisk: PdfFileWriter = (path, bytes) => {
    const fs = require("fs");
    fs.writeFileSync(path, bytes);
};

export type ElectronPdfExportOptions = {
    exportPageUrl: string;
    timeoutMs?: number;
};

/** Composition root for the Electron adapters, so callers only see the PdfExporter seam. */
export function createElectronPdfExporter(options: ElectronPdfExportOptions): PdfExporter {
    return new ElectronPdfExporter({
        backend: new HiddenWindowPdfBackend({ exportPageUrl: options.exportPageUrl }),
        saveDialog: new SiYuanSaveDialog(),
        writeFile: writeFileToDisk,
        timeoutMs: options.timeoutMs,
    });
}