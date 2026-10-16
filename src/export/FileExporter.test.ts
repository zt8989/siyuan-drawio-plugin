import { describe, it, expect } from "vitest";
import {
    ElectronFileExporter,
    FakeFileExporter,
    decodeBase64,
    type FileExportRequest,
} from "./FileExporter";
import type { ExportFileWriter, ExportSaveDialog } from "./SaveTarget";

/**
 * Seam under test: FileExporter.exportFile()
 * (issue #76 — the single local-save channel for exports the editor renders itself:
 * images, SVG, XML). The save dialog and the writer are stubs: this module owns request
 * validation, file-name sanitising, cancel handling and serialization, not the OS dialog.
 */

const PIXELS = "iVBORw0KGgo="; // 8 bytes of a PNG-ish payload

function request(overrides: Partial<FileExportRequest> = {}): FileExportRequest {
    return { filename: "未命名绘图-20261013191759-fygtabu.drawio.png", mimeType: "image/png", data: PIXELS, ...overrides };
}

class StubDialog implements ExportSaveDialog {
    picked: string | null = "/tmp/picked.png";
    seen: Array<{ defaultName: string; mimeType: string }> = [];

    async pick(defaultName: string, mimeType: string): Promise<string | null> {
        this.seen.push({ defaultName, mimeType });
        return this.picked;
    }
}

function exporter(dialog = new StubDialog(), capBytes?: number) {
    const written: Array<{ path: string; bytes: Uint8Array }> = [];
    const writeFile: ExportFileWriter = (path, bytes) => written.push({ path, bytes });
    const exp = new ElectronFileExporter({ saveDialog: dialog, writeFile, maxBytes: capBytes });
    return { exp, written, dialog };
}

describe("FileExporter — the editor's bytes end up where the user chose", () => {
    it("writes the decoded bytes and reports the saved path", async () => {
        const { exp, written, dialog } = exporter();

        const result = await exp.exportFile(request());

        expect(result).toEqual({ status: "saved", path: "/tmp/picked.png" });
        expect(written).toHaveLength(1);
        expect(Array.from(written[0].bytes)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        expect(dialog.seen).toEqual([{ defaultName: request().filename, mimeType: "image/png" }]);
    });

    it("treats a dismissed save dialog as canceled and writes nothing", async () => {
        const dialog = new StubDialog();
        dialog.picked = null;
        const { exp, written } = exporter(dialog);

        expect(await exp.exportFile(request())).toEqual({ status: "canceled" });
        expect(written).toHaveLength(0);
    });

    it("writes straight to targetPath without asking the save dialog", async () => {
        const { exp, written, dialog } = exporter();

        const result = await exp.exportFile(request(), { targetPath: "/tmp/e2e.svg" });

        expect(result).toEqual({ status: "saved", path: "/tmp/e2e.svg" });
        expect(written.map((w) => w.path)).toEqual(["/tmp/e2e.svg"]);
        expect(dialog.seen).toHaveLength(0);
    });

    it("keeps the caller's directory out of the suggested name", async () => {
        const { exp, dialog } = exporter();

        await exp.exportFile(request({ filename: "../../etc/图.drawio.png" }));

        expect(dialog.seen[0].defaultName).toBe("图.drawio.png");
    });
});

describe("FileExporter — refuses requests it cannot write", () => {
    it("rejects an empty payload without opening a dialog", async () => {
        const { exp, written, dialog } = exporter();

        await expect(exp.exportFile(request({ data: "" }))).rejects.toThrow(/data|内容/i);

        expect(dialog.seen).toHaveLength(0);
        expect(written).toHaveLength(0);
    });

    it("rejects a missing file name and mime type", async () => {
        const { exp, dialog } = exporter();

        await expect(exp.exportFile(request({ filename: "" }))).rejects.toThrow(/filename|文件名/i);
        await expect(exp.exportFile(request({ filename: "///" }))).rejects.toThrow(/filename|文件名/i);
        await expect(exp.exportFile(request({ mimeType: "" }))).rejects.toThrow(/mimeType/i);

        expect(dialog.seen).toHaveLength(0);
    });

    it("refuses a payload above the size cap", async () => {
        const { exp, written } = exporter(new StubDialog(), 4);

        await expect(exp.exportFile(request({ data: "iVBORw0KGgo=" }))).rejects.toThrow(/too large|过大/i);

        expect(written).toHaveLength(0);
    });

    it("surfaces a write failure instead of reporting success", async () => {
        const exp = new ElectronFileExporter({
            saveDialog: new StubDialog(),
            writeFile: () => {
                throw new Error("EACCES: permission denied");
            },
        });

        await expect(exp.exportFile(request())).rejects.toThrow("EACCES");
    });
});

describe("FileExporter — one save at a time", () => {
    it("serializes overlapping exports", async () => {
        const order: string[] = [];
        const dialog: ExportSaveDialog = {
            async pick() {
                order.push("pick:start");
                await new Promise((r) => setTimeout(r, 5));
                order.push("pick:end");
                return "/tmp/a.png";
            },
        };
        const exp = new ElectronFileExporter({
            saveDialog: dialog,
            writeFile: (path) => order.push(`write:${path}`),
        });

        await Promise.all([exp.exportFile(request()), exp.exportFile(request())]);

        expect(order).toEqual(["pick:start", "pick:end", "write:/tmp/a.png", "pick:start", "pick:end", "write:/tmp/a.png"]);
    });
});

describe("FakeFileExporter / decodeBase64", () => {
    it("records requests with the recording adapter", async () => {
        const fake = new FakeFileExporter({ status: "saved", path: "/fake/out.png" });

        const result = await fake.exportFile(request(), { targetPath: "/fake/out.png" });

        expect(result).toEqual({ status: "saved", path: "/fake/out.png" });
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0].request.mimeType).toBe("image/png");
        expect(fake.calls[0].options).toEqual({ targetPath: "/fake/out.png" });
    });

    it("decodes base64 text as UTF-8 bytes (Chinese SVG/XML round-trip)", () => {
        const text = '<svg><text>中文标签</text></svg>';
        const base64 = Buffer.from(text, "utf8").toString("base64");

        expect(new TextDecoder().decode(decodeBase64(base64))).toBe(text);
    });
});