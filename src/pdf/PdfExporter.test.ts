import { describe, it, expect } from "vitest";
import {
    ElectronPdfExporter,
    FakePdfExporter,
    suggestPdfName,
    type PdfExportRequest,
    type PdfPrintBackend,
    type PdfSaveDialog,
} from "./PdfExporter";

/**
 * Seam under test: PdfExporter.export()
 * (see issue #75 spec — the only new seam of the local PDF export feature).
 * The print backend and the save dialog are stubs: this module owns the
 * request validation, name/derivation, cancel, timeout, serialization and
 * cleanup behaviour, not the Electron rendering itself.
 */

function request(overrides: Partial<PdfExportRequest> = {}): PdfExportRequest {
    return { format: "pdf", xml: "<mxfile/>", title: "my diagram-20241116160826-vlkz4xs.drawio", ...overrides };
}

class StubBackend implements PdfPrintBackend {
    bytes = new Uint8Array([1, 2, 3]);
    fail: Error | null = null;
    neverFinishes = false;
    renders = 0;
    destroys = 0;
    order: string[] = [];

    constructor(private label = "render") {}

    async renderAndPrint(): Promise<Uint8Array> {
        this.renders++;
        this.order.push(`${this.label}:start`);
        if (this.fail) throw this.fail;
        if (this.neverFinishes) await new Promise(() => {});
        this.order.push(`${this.label}:end`);
        return this.bytes;
    }

    destroy(): void {
        this.destroys++;
    }
}

class StubDialog implements PdfSaveDialog {
    picked: string | null = "/tmp/picked.pdf";
    seenDefaultNames: string[] = [];

    async pick(defaultName: string): Promise<string | null> {
        this.seenDefaultNames.push(defaultName);
        return this.picked;
    }
}

function exporter(backend: StubBackend, dialog = new StubDialog(), timeoutMs?: number) {
    const written: Array<{ path: string; bytes: Uint8Array }> = [];
    const exp = new ElectronPdfExporter({
        backend,
        saveDialog: dialog,
        writeFile: (path, bytes) => written.push({ path, bytes }),
        timeoutMs,
    });
    return { exp, written, dialog };
}

describe("PdfExporter — saved PDF ends up where the user chose", () => {
    it("writes the rendered bytes and reports the saved path", async () => {
        const backend = new StubBackend();
        const { exp, written } = exporter(backend);

        const result = await exp.export(request());

        expect(result).toEqual({ status: "saved", path: "/tmp/picked.pdf" });
        expect(written).toHaveLength(1);
        expect(written[0].path).toBe("/tmp/picked.pdf");
        expect(Array.from(written[0].bytes)).toEqual([1, 2, 3]);
        expect(backend.renders).toBe(1);
    });

    it("suggests a PDF file name from the diagram title, without the internal suffix", async () => {
        const { exp, dialog } = exporter(new StubBackend());

        await exp.export(request({ title: "my diagram-20241116160826-vlkz4xs.drawio" }));

        expect(dialog.seenDefaultNames).toEqual(["my diagram.pdf"]);
    });

    it("suggests a PDF name for compound asset titles and bare titles", async () => {
        const { exp, dialog } = exporter(new StubBackend());

        await exp.export(request({ title: "flow.drawio.svg" }));
        await exp.export(request({ title: "无后缀标题" }));

        expect(dialog.seenDefaultNames).toEqual(["flow.pdf", "无后缀标题.pdf"]);
    });

    it("treats a dismissed save dialog as canceled and writes nothing", async () => {
        const backend = new StubBackend();
        const dialog = new StubDialog();
        dialog.picked = null;
        const { exp, written } = exporter(backend, dialog);

        const result = await exp.export(request());

        expect(result).toEqual({ status: "canceled" });
        expect(written).toHaveLength(0);
        // The destination is chosen before rendering, so a dismissed dialog costs no render.
        expect(backend.renders).toBe(0);
        expect(backend.destroys).toBe(0);
    });

    it("writes straight to targetPath without asking the save dialog", async () => {
        const { exp, written, dialog } = exporter(new StubBackend());

        const result = await exp.export(request(), { targetPath: "/tmp/e2e-out.pdf" });

        expect(result).toEqual({ status: "saved", path: "/tmp/e2e-out.pdf" });
        expect(written.map((w) => w.path)).toEqual(["/tmp/e2e-out.pdf"]);
        expect(dialog.seenDefaultNames).toHaveLength(0);
    });
});

describe("PdfExporter — refuses requests it cannot render", () => {
    it("rejects a request without diagram xml and never renders", async () => {
        const backend = new StubBackend();
        const { exp, written } = exporter(backend);

        await expect(exp.export(request({ xml: "" }))).rejects.toThrow(/xml/i);

        expect(backend.renders).toBe(0);
        expect(written).toHaveLength(0);
    });

    it("rejects a request without a title and never renders", async () => {
        const backend = new StubBackend();
        const { exp } = exporter(backend);

        await expect(exp.export(request({ title: "" }))).rejects.toThrow(/title/i);

        expect(backend.renders).toBe(0);
    });

    it("rejects a non-pdf format and never renders", async () => {
        const backend = new StubBackend();
        const { exp } = exporter(backend);

        await expect(exp.export(request({ format: "png" as unknown as "pdf" }))).rejects.toThrow(/pdf/i);

        expect(backend.renders).toBe(0);
    });
});

describe("PdfExporter — failures keep the workspace clean", () => {
    it("fails the export when the print backend fails, and writes nothing", async () => {
        const backend = new StubBackend();
        backend.fail = new Error("渲染失败");
        const { exp, written } = exporter(backend);

        await expect(exp.export(request())).rejects.toThrow("渲染失败");

        expect(written).toHaveLength(0);
        expect(backend.destroys).toBe(1);
    });

    it("gives up on a render that never finishes and releases the backend", async () => {
        const backend = new StubBackend();
        backend.neverFinishes = true;
        const { exp, written } = exporter(backend, new StubDialog(), 20);

        await expect(exp.export(request())).rejects.toThrow(/timeout|超时/i);

        expect(written).toHaveLength(0);
        expect(backend.destroys).toBe(1);
    });

    it("releases the backend after a successful export", async () => {
        const backend = new StubBackend();
        const { exp } = exporter(backend);

        await exp.export(request());

        expect(backend.destroys).toBe(1);
    });

    it("runs one render at a time so two exports cannot interleave", async () => {
        const backend = new StubBackend();
        const { exp } = exporter(backend);

        await Promise.all([exp.export(request()), exp.export(request())]);

        expect(backend.order).toEqual(["render:start", "render:end", "render:start", "render:end"]);
    });
});

describe("FakePdfExporter — recording adapter used at the same seam", () => {
    it("records requests and answers with the configured result", async () => {
        const fake = new FakePdfExporter({ status: "saved", path: "/fake/out.pdf" });

        const result = await fake.export(request(), { targetPath: "/fake/out.pdf" });

        expect(result).toEqual({ status: "saved", path: "/fake/out.pdf" });
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0].request.format).toBe("pdf");
        expect(fake.calls[0].options).toEqual({ targetPath: "/fake/out.pdf" });
    });
});

describe("suggestPdfName — one source of truth for the suggested file name", () => {
    it("strips the internal suffix and any diagram extension", () => {
        expect(suggestPdfName("架构图-20241116160826-vlkz4xs.drawio")).toBe("架构图.pdf");
        expect(suggestPdfName("flow.drawio.png")).toBe("flow.pdf");
        expect(suggestPdfName("bare")).toBe("bare.pdf");
    });
});