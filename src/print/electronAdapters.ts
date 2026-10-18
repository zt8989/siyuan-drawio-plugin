import { HiddenRenderWindow } from "@/pdf/renderWindow";
import {
    ElectronDiagramPrinter,
    type DiagramPrinter,
    type PrintBackend,
    type PrintOutcome,
    type PrintRequest,
} from "./DiagramPrinter";

/**
 * electronAdapters — the Electron-only half of the local print channel.
 *
 * The render choreography lives in pdf/renderWindow.ts (shared with the PDF export); this
 * adapter only pairs it with Electron's print dialog.
 */

export type HiddenWindowPrintBackendOptions = {
    /** Same-origin URL of the plugin's export page, e.g. /plugins/<name>/webapp/pdf-export.html */
    exportPageUrl: string;
    channelName?: string;
    readyTimeoutMs?: number;
};

export class HiddenWindowPrintBackend implements PrintBackend {
    private readonly window: HiddenRenderWindow;

    constructor(options: HiddenWindowPrintBackendOptions) {
        this.window = new HiddenRenderWindow({
            url: options.exportPageUrl,
            channelName: options.channelName,
            readyTimeoutMs: options.readyTimeoutMs,
        });
    }

    render(request: PrintRequest): Promise<void> {
        return this.window.render(request).then(() => undefined);
    }

    show(): void {
        this.window.show();
    }

    print(): Promise<PrintOutcome> {
        return this.window.print();
    }

    destroy(): void {
        this.window.destroy();
    }
}

export type ElectronDiagramPrinterOptions = {
    exportPageUrl: string;
    timeoutMs?: number;
};

/** Composition root for the Electron print adapters, so callers only see the DiagramPrinter seam. */
export function createElectronDiagramPrinter(options: ElectronDiagramPrinterOptions): DiagramPrinter {
    return new ElectronDiagramPrinter({
        backend: new HiddenWindowPrintBackend({ exportPageUrl: options.exportPageUrl }),
        timeoutMs: options.timeoutMs,
    });
}
