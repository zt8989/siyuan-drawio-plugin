import type { PdfExportRequest } from "./PdfExporter";

/**
 * renderWindow — the hidden draw.io render window shared by the local export channels.
 *
 * Both the PDF export (issue #75) and the print channel own the same choreography: open a
 * window on the plugin's export page, push the diagram through the BroadcastChannel bridge,
 * wait for the page to lay the diagram out, then ask Electron to either produce PDF bytes or
 * send the pages to a printer. This module is that choreography; the exporters above it only
 * decide where the result goes.
 *
 * External seam: render() / printToPdf() / print() / show() / destroy().
 * Verified against SiYuan 3.8.4 / Electron 44 before relying on it:
 *  - a hidden BrowserWindow created through @electron/remote can be printed by SiYuan's own
 *    `siyuan-get printToPDF` command (it looks the window up by webContents id),
 *  - `preferCSSPageSize` makes the output page follow the `@page` size the renderer sets,
 *  - BroadcastChannel is a usable host↔window channel (same kernel origin),
 *  - destroying the window leaves no window behind.
 */

/** Matches client/pdfExportPageBridge.js. */
const CHANNEL_NAME = "siyuan-drawio-pdf-export";
/** A page that never reports readiness is a broken install, not a slow diagram. */
const RENDER_READY_TIMEOUT_MS = 15_000;

export type RenderWindowOptions = {
    /** Same-origin URL of the plugin's export page, e.g. /plugins/<name>/webapp/pdf-export.html */
    url: string;
    channelName?: string;
    readyTimeoutMs?: number;
};

export type RenderInfo = { bounds?: string; pageCount?: number } | null;

export type PrinterOutcome = "printed" | "canceled";

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

/** Electron reports a dismissed print dialog through the failure reason, not a distinct status. */
function isCancel(reason: string): boolean {
    return /cancel/i.test(reason);
}

export class HiddenRenderWindow {
    private win: any = null;
    private channel: BroadcastChannel | null = null;

    constructor(private readonly options: RenderWindowOptions) {}

    /**
     * Opens the export page, hands it the diagram and resolves once the pages are laid out.
     * Leaves the window open: the caller chooses PDF bytes, a printed job or a visible preview.
     */
    async render(request: PdfExportRequest): Promise<RenderInfo> {
        const remote = require("@electron/remote");

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
            const loaded = win.loadURL(this.options.url);
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

            return info;
        } finally {
            clearTimeout(readyTimer);
        }
    }

    /** Turns the rendered window into PDF bytes through SiYuan's own printToPDF command. */
    async printToPdf(): Promise<Uint8Array> {
        const win = this.requireWindow();
        const { ipcRenderer } = require("electron");

        const pdf = await ipcRenderer.invoke("siyuan-get", {
            cmd: "printToPDF",
            webContentsId: win.webContents.id,
            // The renderer paginates with CSS; an explicit pageSize would fight with it.
            pdfOptions: { preferCSSPageSize: true, printBackground: true },
        });

        return pdf instanceof Uint8Array ? pdf : new Uint8Array(pdf);
    }

    /**
     * Sends the rendered pages to a printer and resolves when the dialog is answered.
     * The window is shown first: the native dialog needs an owner window the user can find,
     * and the pages being sent should be visible while the dialog is up.
     */
    async print(): Promise<PrinterOutcome> {
        const win = this.requireWindow();
        this.show();

        const failure = await new Promise<string | null>((resolve) => {
            win.webContents.print(
                {
                    silent: false,
                    printBackground: true,
                    // The export page paginates with CSS (@page from the diagram page format).
                    preferCSSPageSize: true,
                },
                (success: boolean, failureReason?: string) =>
                    resolve(success ? null : failureReason || "打印失败"),
            );
        });

        if (failure == null) {
            return "printed";
        }

        if (isCancel(failure)) {
            return "canceled";
        }

        throw new Error(`打印失败：${failure}`);
    }

    /** Shows the rendered pages (print preview, and the owner window of the print dialog). */
    show(): void {
        if (this.win && !this.win.isDestroyed()) {
            this.win.show();
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

    private requireWindow(): any {
        if (!this.win || this.win.isDestroyed()) {
            throw new Error("打印失败：渲染窗口已关闭");
        }

        return this.win;
    }
}
