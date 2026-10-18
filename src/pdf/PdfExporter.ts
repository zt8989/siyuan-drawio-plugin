import { DrawioAsset } from "@/asset/DrawioAsset";
import type { ExportFileWriter, ExportSaveDialog } from "@/export/SaveTarget";

/**
 * PdfExporter — deep module owning local PDF export (desktop SiYuan).
 *
 * External seam: PdfExporter.export() (what callers and tests use).
 * Internal seam: PdfPrintBackend (hidden window + printToPDF) and PdfSaveDialog/PdfFileWriter —
 * private to the implementation, injected at construction.
 * Two adapters at the external seam → real seam: ElectronPdfExporter (real) and
 * FakePdfExporter (recording, for host-level tests and end-to-end wiring checks).
 *
 * Depth: a single export() call hides request validation, file-name derivation, the save
 * dialog, timeouts, export serialization and renderer cleanup. Deletion test: removing it
 * re-creates that choreography in the message handler and in every future caller.
 */

export type PdfExportRequest = {
    format: "pdf";
    /** Full mxfile data (all pages) as produced by the draw.io editor. */
    xml: string;
    /** Diagram title as shown by the editor; used to suggest the saved file name. */
    title: string;
    allPages?: boolean;
    from?: number;
    to?: number;
    pageId?: string;
    scale?: number;
    border?: number;
    bg?: string;
    pageMargin?: number;
    crop?: boolean;
    fit?: boolean;
    /** Explicit output size used by the non-paged export path, as sent by the export dialog. */
    w?: number;
    h?: number;
    dpi?: number;
    /** Tile the pages across/down and other print-dialog extras forwarded to the renderer. */
    sheetsAcross?: number;
    sheetsDown?: number;
    shadows?: boolean;
    icons?: boolean;
    /** draw.io export variables (globalVars, grid, …) forwarded verbatim to the renderer. */
    extras?: Record<string, unknown>;
};

export type PdfExportOptions = {
    /** Write straight here instead of asking the user (kept for scripting/tests and future targets). */
    targetPath?: string;
};

export type PdfExportResult = { status: "saved"; path: string } | { status: "canceled" };

export interface PdfExporter {
    export(request: PdfExportRequest, options?: PdfExportOptions): Promise<PdfExportResult>;
}

/** Where the rendered PDF comes from. Production adapter: hidden window + Electron printToPDF. */
export interface PdfPrintBackend {
    renderAndPrint(request: PdfExportRequest): Promise<Uint8Array>;
    /** Releases the renderer (window, channel, listeners). Safe to call more than once. */
    destroy(): void;
}

export type PdfSaveDialog = ExportSaveDialog;
export type PdfFileWriter = ExportFileWriter;

/** Rendering a diagram is a few seconds of real work; anything longer is a dead renderer. */
export const PDF_EXPORT_TIMEOUT_MS = 30_000;

/** Suggested file name for a diagram title: drops the internal -timestamp-random suffix and the diagram extension. */
export function suggestPdfName(title: string): string {
    const hName = DrawioAsset.fromPath(title || "").hName;
    return `${hName || title}.pdf`;
}

/** Shared by every channel that renders through the export page (PDF export, printing). */
export function assertRenderableRequest(request: PdfExportRequest): void {
    if (request?.format !== "pdf") {
        throw new Error("绘图渲染请求不合法：format 必须是 pdf");
    }
    if (!request.xml) {
        throw new Error("绘图渲染请求不合法：缺少绘图 xml");
    }
    if (!request.title) {
        throw new Error("绘图渲染请求不合法：缺少绘图 title");
    }
}

export type ElectronPdfExporterDeps = {    backend: PdfPrintBackend;
    saveDialog: PdfSaveDialog;
    writeFile: PdfFileWriter;
    timeoutMs?: number;
};

/**
 * ElectronPdfExporter — real adapter at the PdfExporter seam.
 * Asks for the destination first (so a dismissed dialog costs no render), then renders,
 * writes and always releases the renderer.
 */
export class ElectronPdfExporter implements PdfExporter {
    /** Serializes exports: two overlapping requests must not share a renderer. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(private deps: ElectronPdfExporterDeps) {}

    export(request: PdfExportRequest, options: PdfExportOptions = {}): Promise<PdfExportResult> {
        const run = this.queue.then(
            () => this.exportNow(request, options),
            () => this.exportNow(request, options),
        );
        // Keep the queue alive after a failure without swallowing the caller's rejection.
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async exportNow(request: PdfExportRequest, options: PdfExportOptions): Promise<PdfExportResult> {
        assertRenderableRequest(request);
        const target = options.targetPath ?? (await this.deps.saveDialog.pick(suggestPdfName(request.title), "application/pdf"));
        if (target == null) {
            return { status: "canceled" };
        }

        let bytes: Uint8Array;
        try {
            bytes = await this.renderWithTimeout(request);
        } finally {
            this.deps.backend.destroy();
        }

        this.deps.writeFile(target, bytes);
        return { status: "saved", path: target };
    }

    private renderWithTimeout(request: PdfExportRequest): Promise<Uint8Array> {
        const timeoutMs = this.deps.timeoutMs ?? PDF_EXPORT_TIMEOUT_MS;
        const rendered = this.deps.backend.renderAndPrint(request);
        // The losing promise of the race must not surface as an unhandled rejection.
        rendered.catch(() => undefined);

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`PDF 导出超时：本机渲染 ${timeoutMs}ms 内未完成`)),
                timeoutMs,
            );
        });

        return Promise.race([rendered, timeout]).finally(() => {
            if (timer) clearTimeout(timer);
        });
    }
}

/** FakePdfExporter — recording adapter at the same seam, for tests and wiring checks. */
export class FakePdfExporter implements PdfExporter {
    readonly calls: Array<{ request: PdfExportRequest; options?: PdfExportOptions }> = [];

    constructor(private readonly result: PdfExportResult | { error: string } = { status: "saved", path: "/fake/out.pdf" }) {}

    async export(request: PdfExportRequest, options?: PdfExportOptions): Promise<PdfExportResult> {
        this.calls.push({ request, options });
        if ("error" in this.result) {
            throw new Error(this.result.error);
        }
        return this.result;
    }
}

/**
 * Adapter for hosts without a local renderer (mobile, browser). The bridge refuses the request
 * before it gets here, so this only turns a programming error into a readable message.
 */
export function unavailablePdfExporter(reason = "本机 PDF 导出仅在桌面端思源可用"): PdfExporter {
    return {
        export: async () => {
            throw new Error(reason);
        },
    };
}