import { describe, it, expect } from "vitest";
import { handlePdfBridgeMessage, type PdfExportHost } from "./pdfExportBridge";
import { FakePdfExporter, type PdfExporter } from "./PdfExporter";
import { BRIDGE_TYPES } from "@/bridge/DrawioBridge";

/**
 * Seam under test: the host side of the getCapabilities / exportPdf bridge contract
 * (issue #75 spec). pdfExportBridge is exercised with the recording adapter at the
 * PdfExporter seam, so no Electron is involved: what is asserted here is the routing,
 * the reply shape the guest callback expects (positional args) and that a failure
 * never escapes as an unhandled rejection.
 */

function host(exporter: PdfExporter = new FakePdfExporter(), pdfExport = true): PdfExportHost {
    return { exporter, capabilities: { pdfExport } };
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

describe("pdfExportBridge — capability probe feeds the guest patch", () => {
    it("answers the probe with the host capability", async () => {
        const reply = await handlePdfBridgeMessage(
            { type: BRIDGE_TYPES.GET_CAPABILITIES, callbackId: "cb-1" },
            host(new FakePdfExporter(), true),
        );

        expect(reply).toEqual({ type: BRIDGE_TYPES.CALLBACK, callbackId: "cb-1", payload: [{ pdfExport: true }] });
    });

    it("reports no local PDF export on platforms without Electron", async () => {
        const reply = await handlePdfBridgeMessage(
            { type: BRIDGE_TYPES.GET_CAPABILITIES, callbackId: "cb-1" },
            host(new FakePdfExporter(), false),
        );

        expect(reply?.payload).toEqual([{ pdfExport: false }]);
    });
});

describe("pdfExportBridge — export request reaches the exporter and answers the guest", () => {
    it("forwards the draw.io export parameters and returns the saved path", async () => {
        const exporter = new FakePdfExporter({ status: "saved", path: "/tmp/架构图.pdf" });

        const reply = await handlePdfBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload, callbackId: "cb-2" },
            host(exporter),
        );

        expect(exporter.calls).toHaveLength(1);
        expect(exporter.calls[0].request).toMatchObject({
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
        const exporter = new FakePdfExporter();

        await handlePdfBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: { ...drawioPayload, targetPath: "/tmp/out.pdf" }, callbackId: "cb-2" },
            host(exporter),
        );

        expect(exporter.calls[0].options).toEqual({ targetPath: "/tmp/out.pdf" });
    });

    it("accepts the export variables as the JSON string drawio sends on the print-dialog path", async () => {
        const exporter = new FakePdfExporter();

        await handlePdfBridgeMessage(
            {
                type: BRIDGE_TYPES.EXPORT_PDF,
                payload: { ...drawioPayload, allPages: undefined, extras: '{"globalVars":{"page":"Page-1"}}' },
                callbackId: "cb-9",
            },
            host(exporter),
        );

        expect(exporter.calls[0].request.extras).toEqual({ globalVars: { page: "Page-1" } });
    });

    it("forwards the print-dialog page options the renderer understands", async () => {
        const exporter = new FakePdfExporter();

        await handlePdfBridgeMessage(
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
            host(exporter),
        );

        expect(exporter.calls[0].request).toMatchObject({
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
        const reply = await handlePdfBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload, callbackId: "cb-3" },
            host(new FakePdfExporter({ status: "canceled" })),
        );

        expect(reply?.payload).toEqual([{ status: "canceled" }]);
    });

    it("turns an export failure into an error reply instead of a rejection", async () => {
        const reply = await handlePdfBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload, callbackId: "cb-4" },
            host(new FakePdfExporter({ error: "渲染失败" })),
        );

        expect(reply?.payload).toEqual([{ status: "error", message: "渲染失败" }]);
    });

    it("refuses to export when the platform has no local renderer", async () => {
        const exporter = new FakePdfExporter();

        const reply = await handlePdfBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload, callbackId: "cb-5" },
            host(exporter, false),
        );

        expect(exporter.calls).toHaveLength(0);
        expect(reply?.payload).toEqual([{ status: "error", message: expect.stringContaining("桌面") }]);
    });

    it("rejects a malformed request with an error reply and never renders", async () => {
        const exporter = new FakePdfExporter();

        const reply = await handlePdfBridgeMessage(
            { type: BRIDGE_TYPES.EXPORT_PDF, payload: { format: "png" }, callbackId: "cb-6" },
            host(exporter),
        );

        expect(exporter.calls).toHaveLength(0);
        expect(reply?.payload).toEqual([{ status: "error", message: expect.stringMatching(/xml|pdf/i) }]);
    });
});

describe("pdfExportBridge — messages outside the PDF contract are ignored", () => {
    it("ignores requests without a callback id", async () => {
        expect(await handlePdfBridgeMessage({ type: BRIDGE_TYPES.EXPORT_PDF, payload: drawioPayload }, host())).toBeNull();
        expect(await handlePdfBridgeMessage({ type: BRIDGE_TYPES.GET_CAPABILITIES }, host())).toBeNull();
    });

    it("ignores message types it does not own", async () => {
        expect(await handlePdfBridgeMessage({ type: BRIDGE_TYPES.OPEN, callbackId: "cb-7" }, host())).toBeNull();
        expect(await handlePdfBridgeMessage({ type: BRIDGE_TYPES.CALLBACK, callbackId: "cb-8", payload: [] }, host())).toBeNull();
    });
});