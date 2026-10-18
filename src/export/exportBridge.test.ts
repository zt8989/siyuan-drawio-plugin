import { describe, it, expect } from "vitest";
import { handleExportBridgeMessage, type ExportHost } from "./exportBridge";
import { FakePdfExporter, type PdfExporter } from "@/pdf/PdfExporter";
import { ElectronFileExporter, FakeFileExporter, type FileExporter } from "./FileExporter";
import { FakeDiagramPrinter, type DiagramPrinter } from "@/print/DiagramPrinter";
import { BRIDGE_TYPES } from "@/bridge/DrawioBridge";

/**
 * Seam under test: the host side of the getCapabilities / exportPdf bridge contract
 * (issue #75 spec). pdfExportBridge is exercised with the recording adapter at the
 * PdfExporter seam, so no Electron is involved: what is asserted here is the routing,
 * the reply shape the guest callback expects (positional args) and that a failure
 * never escapes as an unhandled rejection.
 */

function host(
    pdfExporter: PdfExporter = new FakePdfExporter(),
    pdfExport = true,
    fileExporter: FileExporter = new FakeFileExporter(),
    fileExport = pdfExport,
    diagramPrinter: DiagramPrinter = new FakeDiagramPrinter(),
    print = pdfExport,
): ExportHost {
    return { pdfExporter, fileExporter, diagramPrinter, capabilities: { pdfExport, fileExport, print } };
}

const drawioPayload = {
    format: "pdf",
    xml: "<mxfile><diagram id=\"p1\"/></mxfile>",
    title: "架构图-20241116160826-vlkz4xs.drawio",
    filename: "架构图.drawio",
    allPages: "1",
    scale: 1,
    border: 0,
    bg: "#ffffff",
};

describe("exportBridge — capability probe feeds the guest patches", () => {
    it("answers the probe with the host capabilities", async () => {
        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.GET_CAPABILITIES, callbackId: "cb-1" },
            host(new FakePdfExporter(), true),
        );

        expect(reply).toEqual({
            type: BRIDGE_TYPES.CALLBACK,
            callbackId: "cb-1",
            payload: [{ pdfExport: true, fileExport: true, print: true }],
        });
    });

    it("reports no local export on platforms without Electron", async () => {
        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.GET_CAPABILITIES, callbackId: "cb-1" },
            host(new FakePdfExporter(), false),
        );

        expect(reply?.payload).toEqual([{ pdfExport: false, fileExport: false, print: false }]);
    });
});

describe("exportBridge — export request reaches the exporter and answers the guest", () => {
    it("forwards the draw.io export parameters and returns the saved path", async () => {
        const pdfExporter = new FakePdfExporter({ status: "saved", path: "/tmp/架构图.pdf" });

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload, callbackId: "cb-2" },
            host(pdfExporter),
        );

        expect(pdfExporter.calls).toHaveLength(1);
        expect(pdfExporter.calls[0].request).toMatchObject({
            format: "pdf",
            xml: drawioPayload.xml,
            title: drawioPayload.title,
            allPages: true,
            scale: 1,
            border: 0,
            bg: "#ffffff",
        });
        expect(reply).toEqual({
            type: BRIDGE_TYPES.CALLBACK,
            callbackId: "cb-2",
            payload: [{ status: "saved", path: "/tmp/架构图.pdf" }],
        });
    });

    it("passes the optional target path through (scripting / end-to-end runs)", async () => {
        const pdfExporter = new FakePdfExporter();

        await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: { ...drawioPayload, targetPath: "/tmp/out.pdf" }, callbackId: "cb-2" },
            host(pdfExporter),
        );

        expect(pdfExporter.calls[0].options).toEqual({ targetPath: "/tmp/out.pdf" });
    });

    it("accepts the export variables as the JSON string drawio sends on the print-dialog path", async () => {
        const pdfExporter = new FakePdfExporter();

        await handleExportBridgeMessage(
            {
                type: BRIDGE_TYPES.EXPORT_PDF,
                payload: { ...drawioPayload, allPages: undefined, extras: '{"globalVars":{"page":"Page-1"}}' },
                callbackId: "cb-9",
            },
            host(pdfExporter),
        );

        expect(pdfExporter.calls[0].request.extras).toEqual({ globalVars: { page: "Page-1" } });
    });

    it("forwards the print-dialog page options the renderer understands", async () => {
        const pdfExporter = new FakePdfExporter();

        await handleExportBridgeMessage(
            {
                type: BRIDGE_TYPES.EXPORT_PDF,
                payload: {
                    ...drawioPayload,
                    pageRange: undefined,
                    from: 1,
                    to: 2,
                    crop: "1",
                    fit: "1",
                    pageMargin: 10,
                    sheetsAcross: 2,
                    sheetsDown: 1,
                    shadows: "1",
                    icons: "1",
                },
                callbackId: "cb-10",
            },
            host(pdfExporter),
        );

        expect(pdfExporter.calls[0].request).toMatchObject({
            from: 1,
            to: 2,
            crop: true,
            fit: true,
            pageMargin: 10,
            sheetsAcross: 2,
            sheetsDown: 1,
            shadows: true,
            icons: true,
        });
    });

    it("reports a dismissed save dialog as canceled", async () => {
        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload, callbackId: "cb-3" },
            host(new FakePdfExporter({ status: "canceled" })),
        );

        expect(reply?.payload).toEqual([{ status: "canceled" }]);
    });

    it("turns an export failure into an error reply instead of a rejection", async () => {
        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload, callbackId: "cb-4" },
            host(new FakePdfExporter({ error: "渲染失败" })),
        );

        expect(reply?.payload).toEqual([{ status: "error", message: "渲染失败" }]);
    });

    it("refuses to export when the platform has no local renderer", async () => {
        const pdfExporter = new FakePdfExporter();

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload, callbackId: "cb-5" },
            host(pdfExporter, false),
        );

        expect(pdfExporter.calls).toHaveLength(0);
        expect(reply?.payload).toEqual([{ status: "error", message: expect.stringContaining("桌面") }]);
    });

    it("rejects a malformed request with an error reply and never renders", async () => {
        const pdfExporter = new FakePdfExporter();

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: { format: "png" }, callbackId: "cb-6" },
            host(pdfExporter),
        );

        expect(pdfExporter.calls).toHaveLength(0);
        expect(reply?.payload).toEqual([{ status: "error", message: expect.stringMatching(/xml|pdf/i) }]);
    });
});

describe("exportBridge — messages outside the PDF contract are ignored", () => {
    it("ignores requests without a callback id", async () => {
        expect(await handleExportBridgeMessage({ type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload }, host())).toBeNull();
        expect(await handleExportBridgeMessage({ type: BRIDGE_TYPES.GET_CAPABILITIES }, host())).toBeNull();
    });

    it("ignores message types it does not own", async () => {
        expect(await handleExportBridgeMessage({ type: BRIDGE_TYPES.OPEN, callbackId: "cb-7" }, host())).toBeNull();
        expect(await handleExportBridgeMessage({ type: BRIDGE_TYPES.CALLBACK, callbackId: "cb-8", payload: [] }, host())).toBeNull();
    });
});
describe("exportBridge — locally rendered exports reach the file channel (issue #76)", () => {
    const pngPayload = {
        filename: "未命名绘图-20261013191759-fygtabu.drawio.png",
        mimeType: "image/png",
        data: "iVBORw0KGgo=",
    };

    it("forwards the render result and returns the saved path", async () => {
        const fileExporter = new FakeFileExporter({ status: "saved", path: "/tmp/图.drawio.png" });

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_FILE, payload: pngPayload, callbackId: "cb-file-1" },
            host(new FakePdfExporter(), true, fileExporter),
        );

        expect(fileExporter.calls).toHaveLength(1);
        expect(fileExporter.calls[0].request).toEqual(pngPayload);
        expect(reply).toEqual({
            type: BRIDGE_TYPES.CALLBACK,
            callbackId: "cb-file-1",
            payload: [{ status: "saved", path: "/tmp/图.drawio.png" }],
        });
    });

    it("passes the optional target path through (scripting / end-to-end runs)", async () => {
        const fileExporter = new FakeFileExporter();

        await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_FILE, payload: { ...pngPayload, targetPath: "/tmp/out.svg" }, callbackId: "cb-file-2" },
            host(new FakePdfExporter(), true, fileExporter),
        );

        expect(fileExporter.calls[0].options).toEqual({ targetPath: "/tmp/out.svg" });
    });

    it("reports a dismissed save dialog as canceled", async () => {
        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_FILE, payload: pngPayload, callbackId: "cb-file-3" },
            host(new FakePdfExporter(), true, new FakeFileExporter({ status: "canceled" })),
        );

        expect(reply?.payload).toEqual([{ status: "canceled" }]);
    });

    it("turns a write failure into an error reply instead of a rejection", async () => {
        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_FILE, payload: pngPayload, callbackId: "cb-file-4" },
            host(new FakePdfExporter(), true, new FakeFileExporter({ error: "EACCES" })),
        );

        expect(reply?.payload).toEqual([{ status: "error", message: "EACCES" }]);
    });

    it("refuses to save when the platform has no local writer", async () => {
        const fileExporter = new FakeFileExporter();

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_FILE, payload: pngPayload, callbackId: "cb-file-5" },
            host(new FakePdfExporter(), true, fileExporter, false),
        );

        expect(fileExporter.calls).toHaveLength(0);
        expect(reply?.payload).toEqual([{ status: "error", message: expect.stringContaining("桌面") }]);
    });

    it("answers with the exporter's validation error for an unusable payload", async () => {
        const fileExporter = new ElectronFileExporter({
            saveDialog: { pick: async () => "/tmp/never-written" },
            writeFile: () => {
                throw new Error("must not be called");
            },
        });

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_FILE, payload: { filename: "a.png", mimeType: "image/png" }, callbackId: "cb-file-6" },
            host(new FakePdfExporter(), true, fileExporter),
        );

        expect(reply?.payload).toEqual([{ status: "error", message: expect.stringMatching(/data|内容/i) }]);
    });
});

describe("exportBridge — 打印 reaches the printer channel", () => {
    it("forwards the print-dialog parameters and returns the printed status", async () => {
        const printer = new FakeDiagramPrinter({ status: "printed" });

        const reply = await handleExportBridgeMessage(
            {
                type: BRIDGE_TYPES.PRINT_DIAGRAM,
                payload: { ...drawioPayload, allPages: undefined, from: 0, to: 1, pageMargin: 10, crop: "1", fit: "1" },
                callbackId: "cb-print-1",
            },
            host(new FakePdfExporter(), true, new FakeFileExporter(), true, printer),
        );

        expect(printer.calls).toHaveLength(1);
        expect(printer.calls[0].request).toMatchObject({
            format: "pdf",
            xml: drawioPayload.xml,
            title: drawioPayload.title,
            from: 0,
            to: 1,
            pageMargin: 10,
            crop: true,
            fit: true,
        });
        // 打印 (not 预览) unless the guest asks for the preview explicitly.
        expect(printer.calls[0].options).toEqual({ preview: false });
        expect(reply).toEqual({
            type: BRIDGE_TYPES.CALLBACK,
            callbackId: "cb-print-1",
            payload: [{ status: "printed" }],
        });
    });

    it("keeps the preview flag the print dialog sends for 预览", async () => {
        const printer = new FakeDiagramPrinter({ status: "previewed" });

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.PRINT_DIAGRAM, payload: { ...drawioPayload, preview: true }, callbackId: "cb-print-2" },
            host(new FakePdfExporter(), true, new FakeFileExporter(), true, printer),
        );

        expect(printer.calls[0].options).toEqual({ preview: true });
        expect(reply?.payload).toEqual([{ status: "previewed" }]);
    });

    it("reports a dismissed print dialog as canceled", async () => {
        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.PRINT_DIAGRAM, payload: drawioPayload, callbackId: "cb-print-3" },
            host(new FakePdfExporter(), true, new FakeFileExporter(), true, new FakeDiagramPrinter({ status: "canceled" })),
        );

        expect(reply?.payload).toEqual([{ status: "canceled" }]);
    });

    it("turns a print failure into an error reply instead of a rejection", async () => {
        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.PRINT_DIAGRAM, payload: drawioPayload, callbackId: "cb-print-4" },
            host(new FakePdfExporter(), true, new FakeFileExporter(), true, new FakeDiagramPrinter({ error: "没有可用的打印机" })),
        );

        expect(reply?.payload).toEqual([{ status: "error", message: "没有可用的打印机" }]);
    });

    it("refuses to print when the platform has no local renderer", async () => {
        const printer = new FakeDiagramPrinter();

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.PRINT_DIAGRAM, payload: drawioPayload, callbackId: "cb-print-5" },
            host(new FakePdfExporter(), false, new FakeFileExporter(), false, printer, false),
        );

        expect(printer.calls).toHaveLength(0);
        expect(reply?.payload).toEqual([{ status: "error", message: expect.stringContaining("桌面") }]);
    });

    it("rejects an unrenderable print request before reaching the printer", async () => {
        const printer = new FakeDiagramPrinter();

        const reply = await handleExportBridgeMessage(
            { type: BRIDGE_TYPES.PRINT_DIAGRAM, payload: { format: "pdf" }, callbackId: "cb-print-6" },
            host(new FakePdfExporter(), true, new FakeFileExporter(), true, printer),
        );

        expect(printer.calls).toHaveLength(0);
        expect(reply?.payload).toEqual([{ status: "error", message: expect.stringMatching(/xml|title/i) }]);
    });
});
