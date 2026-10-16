import { BRIDGE_TYPES } from "@/bridge/DrawioBridge";
import type { BridgeMessage } from "@/bridge/DrawioBridge";
import type { PdfExportOptions, PdfExportRequest, PdfExporter } from "@/pdf/PdfExporter";
import type { FileExportOptions, FileExportRequest, FileExporter } from "./FileExporter";

/**
 * exportBridge — host side of the local export contract (issues #75 and #76).
 *
 * Small interface: handleExportBridgeMessage(message, host) → reply | null.
 * Hides the draw.io parameter vocabulary (string "1" flags, filename fallback, JSON-string
 * extras), the positional-args reply the guest callback expects, and the rule that an export
 * failure becomes an error reply instead of a rejection. Callers (the plugin's message
 * handler) only post the reply back to the guest window.
 *
 * Two channels share one contract: PDF renders in a hidden window (issue #75), everything the
 * editor renders itself (PNG/JPEG/WebP/SVG/XML, issue #76) is written straight to disk.
 */

export type ExportCapabilities = { pdfExport: boolean; fileExport: boolean };

export interface ExportHost {
    /** The PdfExporter seam: real adapter in production, recording adapter in tests. */
    pdfExporter: PdfExporter;
    /** The FileExporter seam: real adapter in production, recording adapter in tests. */
    fileExporter: FileExporter;
    capabilities: ExportCapabilities;
}

export type ExportBridgeReply = { type: string; callbackId: string; payload: unknown[] };

type ExportResult = { status: "saved"; path: string } | { status: "canceled" };

function asNumber(value: unknown): number | undefined {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return typeof num === "number" && isFinite(num) ? num : undefined;
}

function asFlag(value: unknown): boolean | undefined {
    if (value == null) return undefined;
    return value === true || value === "1" || value === 1 || value === "true";
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * drawio passes the export variables as a JSON string on the request path and as an object
 * on the dialog path; the renderer wants the object.
 */
function asExtras(value: unknown): Record<string, unknown> | undefined {
    if (typeof value === "object" && value !== null) return value as Record<string, unknown>;
    if (typeof value !== "string" || value.length === 0) return undefined;

    try {
        const parsed = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
    } catch {
        return undefined;
    }
}

/** Peer of suggestPdfName: only used when the guest omits the diagram title. */
function titleFromFilename(filename: string): string {
    return filename.replace(/\.(drawio|svg|png|html)$/i, "");
}

/**
 * Translates the draw.io export-dialog parameters into a typed request.
 * Unknown keys are dropped: the renderer must not be able to smuggle arbitrary
 * options through the bridge.
 */
export function toPdfExport(payload: unknown): { request: PdfExportRequest; options: PdfExportOptions } {
    const p = (payload ?? {}) as Record<string, unknown>;

    if (p.format != null && p.format !== "pdf") {
        throw new Error("PDF 导出请求不合法：format 必须是 pdf");
    }

    const xml = asString(p.xml);
    if (!xml) {
        throw new Error("PDF 导出请求不合法：缺少绘图 xml");
    }

    const title = asString(p.title) ?? (asString(p.filename) ? titleFromFilename(asString(p.filename) as string) : "");
    if (!title) {
        throw new Error("PDF 导出请求不合法：缺少绘图 title");
    }

    const request: PdfExportRequest = {
        format: "pdf",
        xml,
        title,
        allPages: asFlag(p.allPages),
        from: asNumber(p.from),
        to: asNumber(p.to),
        pageId: asString(p.pageId),
        scale: asNumber(p.scale),
        border: asNumber(p.border),
        bg: asString(p.bg),
        pageMargin: asNumber(p.pageMargin),
        crop: asFlag(p.crop),
        fit: asFlag(p.fit),
        w: asNumber(p.w),
        h: asNumber(p.h),
        dpi: asNumber(p.dpi),
        sheetsAcross: asNumber(p.sheetsAcross),
        sheetsDown: asNumber(p.sheetsDown),
        shadows: asFlag(p.shadows),
        icons: asFlag(p.icons),
        extras: asExtras(p.extras),
    };

    return { request, options: { targetPath: asString(p.targetPath) } };
}

/**
 * Translates a locally rendered export (canvas base64 or encoded text) into a typed request.
 * The exporter owns the validation and produces the readable error message.
 */
export function toFileExport(payload: unknown): { request: FileExportRequest; options: FileExportOptions } {
    const p = (payload ?? {}) as Record<string, unknown>;

    return {
        request: {
            filename: asString(p.filename) ?? "",
            mimeType: asString(p.mimeType) ?? "",
            data: typeof p.data === "string" ? p.data : "",
        },
        options: { targetPath: asString(p.targetPath) },
    };
}

function reply(callbackId: string, payload: unknown[]): ExportBridgeReply {
    return { type: BRIDGE_TYPES.CALLBACK, callbackId, payload };
}

function resultReply(callbackId: string, result: ExportResult): ExportBridgeReply {
    return reply(
        callbackId,
        result.status === "saved" ? [{ status: result.status, path: result.path }] : [{ status: result.status }],
    );
}

function messageOf(error: unknown): string {
    const message = (error as { message?: string } | null)?.message;
    return message ? message : String(error);
}

export async function handleExportBridgeMessage(msg: BridgeMessage, host: ExportHost): Promise<ExportBridgeReply | null> {
    const callbackId = msg?.callbackId;
    if (!callbackId) {
        return null;
    }

    if (msg.type === BRIDGE_TYPES.GET_CAPABILITIES) {
        return reply(callbackId, [
            {
                pdfExport: !!host.capabilities?.pdfExport,
                fileExport: !!host.capabilities?.fileExport,
            },
        ]);
    }

    if (msg.type === BRIDGE_TYPES.EXPORT_PDF) {
        if (!host.capabilities?.pdfExport) {
            return reply(callbackId, [{ status: "error", message: "本机 PDF 导出仅在桌面端思源可用" }]);
        }

        try {
            const { request, options } = toPdfExport(msg.payload);
            return resultReply(callbackId, await host.pdfExporter.export(request, options));
        } catch (error) {
            return reply(callbackId, [{ status: "error", message: messageOf(error) }]);
        }
    }

    if (msg.type === BRIDGE_TYPES.EXPORT_FILE) {
        if (!host.capabilities?.fileExport) {
            return reply(callbackId, [{ status: "error", message: "本机保存仅在桌面端思源可用" }]);
        }

        try {
            const { request, options } = toFileExport(msg.payload);
            return resultReply(callbackId, await host.fileExporter.exportFile(request, options));
        } catch (error) {
            return reply(callbackId, [{ status: "error", message: messageOf(error) }]);
        }
    }

    return null;
}