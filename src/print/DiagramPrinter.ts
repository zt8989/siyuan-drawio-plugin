import { assertRenderableRequest, type PdfExportRequest } from "@/pdf/PdfExporter";

/**
 * DiagramPrinter — deep module owning the local print channel (文件 → 打印).
 *
 * Upstream prints through mxPrintPreview: it opens a new browser window and calls print() on
 * it. SiYuan's Electron window handler refuses (and redirects) new windows, so the preview
 * window is never created and the editor reports "更新预览出错". The desktop draw.io build
 * avoids this by rendering in its main process; here the plugin host does the same: it renders
 * the diagram in the plugin-owned export page and hands it to Electron's print dialog.
 *
 * External seam: DiagramPrinter.print() (what callers and tests use).
 * Internal seam: PrintBackend — the rendered window + print dialog, injected at construction.
 * Two adapters at the external seam → real seam: ElectronDiagramPrinter (real) and
 * FakeDiagramPrinter (recording, for host-level tests and wiring checks).
 *
 * Depth: one print() call hides request validation, the render timeout, the print dialog, the
 * preview lifetime and serialization. A user reading the print dialog is not a failure, so the
 * timeout only covers rendering.
 */

/** The diagram is rendered with the same vocabulary as the PDF export (same export page). */
export type PrintRequest = PdfExportRequest;

export type PrintOptions = {
    /** Render and show the pages without printing (upstream's 预览 button). */
    preview?: boolean;
};

export type PrintResult =
    | { status: "printed" }
    | { status: "canceled" }
    | { status: "previewed" };

export type PrintOutcome = "printed" | "canceled";

/** Where the pages come from and where they go. Production: hidden window + Electron print. */
export interface PrintBackend {
    /** Renders the diagram in the export page; the window stays open for show()/print(). */
    render(request: PrintRequest): Promise<void>;
    /** Makes the rendered pages visible (print preview, and the print dialog's owner window). */
    show(): void;
    /** Sends the rendered pages to a printer, resolving when the dialog is answered. */
    print(): Promise<PrintOutcome>;
    /** Releases the renderer (window, channel, listeners). Safe to call more than once. */
    destroy(): void;
}

export interface DiagramPrinter {
    print(request: PrintRequest, options?: PrintOptions): Promise<PrintResult>;
}

/** Rendering a diagram is a few seconds of real work; anything longer is a dead renderer. */
export const PRINT_RENDER_TIMEOUT_MS = 30_000;

export type ElectronDiagramPrinterDeps = {
    backend: PrintBackend;
    /** Backstop for the render phase only — the print dialog itself waits for the user. */
    timeoutMs?: number;
};

/**
 * ElectronDiagramPrinter — real adapter at the DiagramPrinter seam.
 * Renders first (a broken render costs no print dialog), then either shows the preview or
 * prints, and always releases the renderer unless the visible result *is* the preview.
 */
export class ElectronDiagramPrinter implements DiagramPrinter {
    /** Serializes prints: two overlapping requests must not share a renderer. */
    private queue: Promise<unknown> = Promise.resolve();

    constructor(private deps: ElectronDiagramPrinterDeps) {}

    print(request: PrintRequest, options: PrintOptions = {}): Promise<PrintResult> {
        const run = this.queue.then(
            () => this.printNow(request, options),
            () => this.printNow(request, options),
        );
        // Keep the queue alive after a failure without swallowing the caller's rejection.
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async printNow(request: PrintRequest, options: PrintOptions): Promise<PrintResult> {
        assertRenderableRequest(request);

        try {
            await this.renderWithTimeout(request);
        } catch (error) {
            this.deps.backend.destroy();
            throw error;
        }

        if (options.preview === true) {
            this.deps.backend.show();
            // The visible window is the result; the next print/preview replaces it.
            return { status: "previewed" };
        }

        try {
            return { status: await this.deps.backend.print() };
        } finally {
            this.deps.backend.destroy();
        }
    }

    private renderWithTimeout(request: PrintRequest): Promise<void> {
        const timeoutMs = this.deps.timeoutMs ?? PRINT_RENDER_TIMEOUT_MS;
        const rendered = this.deps.backend.render(request);
        // The losing promise of the race must not surface as an unhandled rejection.
        rendered.catch(() => undefined);

        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`打印超时：本机渲染 ${timeoutMs}ms 内未完成`)),
                timeoutMs,
            );
        });

        return Promise.race([rendered, timeout]).finally(() => {
            if (timer) clearTimeout(timer);
        });
    }
}

/** FakeDiagramPrinter — recording adapter at the same seam, for tests and wiring checks. */
export class FakeDiagramPrinter implements DiagramPrinter {
    readonly calls: Array<{ request: PrintRequest; options?: PrintOptions }> = [];

    constructor(private readonly result: PrintResult | { error: string } = { status: "printed" }) {}

    async print(request: PrintRequest, options?: PrintOptions): Promise<PrintResult> {
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
export function unavailableDiagramPrinter(reason = "本机打印仅在桌面端思源可用"): DiagramPrinter {
    return {
        print: async () => {
            throw new Error(reason);
        },
    };
}
