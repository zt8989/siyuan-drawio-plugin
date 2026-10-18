import { ElectronPdfExporter } from "./PdfExporter";
import type { PdfExportRequest, PdfExporter, PdfPrintBackend } from "./PdfExporter";
import { HiddenRenderWindow } from "./renderWindow";
import { SiYuanSaveDialog, writeFileToDisk } from "@/export/SaveTarget";

/**
 * electronAdapters — the Electron-only half of the local PDF export (issue #75).
 *
 * The render choreography lives in renderWindow.ts (shared with the print channel); this
 * adapter only pairs it with printToPDF and the native save dialog.
 */

export type HiddenWindowPdfBackendOptions = {
    /** Same-origin URL of the plugin's export page, e.g. /plugins/<name>/webapp/pdf-export.html */
    exportPageUrl: string;
    channelName?: string;
    readyTimeoutMs?: number;
};

export class HiddenWindowPdfBackend implements PdfPrintBackend {
    private readonly window: HiddenRenderWindow;

    constructor(options: HiddenWindowPdfBackendOptions) {
        this.window = new HiddenRenderWindow({
            url: options.exportPageUrl,
            channelName: options.channelName,
            readyTimeoutMs: options.readyTimeoutMs,
        });
    }

    async renderAndPrint(request: PdfExportRequest): Promise<Uint8Array> {
        await this.window.render(request);

        return this.window.printToPdf();
    }

    destroy(): void {
        this.window.destroy();
    }
}

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
