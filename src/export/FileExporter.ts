/**
 * FileExporter — deep module owning the local save channel for exports the editor renders
 * itself (issue #76: PNG/JPEG/WebP, SVG, XML, …).
 *
 * External seam: FileExporter.exportFile() (what callers and tests use).
 * Internal seams: ExportSaveDialog and ExportFileWriter — private to the implementation,
 * injected at construction (the real adapters live in SaveTarget.ts and are shared with the
 * PDF export from issue #75).
 * Two adapters at the external seam → real seam: ElectronFileExporter and FakeFileExporter.
 *
 * Depth: one exportFile() call hides request validation, name sanitising, base64 decoding,
 * size limiting, the save dialog, writing and serialization. The bytes are produced by the
 * editor (canvas or text); this module never renders.
 */

import type { ExportFileWriter, ExportSaveDialog } from "./SaveTarget";
import { SiYuanSaveDialog, writeFileToDisk } from "./SaveTarget";

export type FileExportRequest = {
    /** Suggested file name as the editor would have used it (may include .drawio.png etc). */
    filename: string;
    mimeType: string;
    /** Payload, base64. Images come from the canvas, text formats are encoded by the guest. */
    data: string;
};

export type FileExportOptions = {
    /** Write straight here instead of asking the user (scripting, end-to-end runs). */
    targetPath?: string;
};

export type FileExportResult = { status: "saved"; path: string } | { status: "canceled" };

export interface FileExporter {
    exportFile(request: FileExportRequest, options?: FileExportOptions): Promise<FileExportResult>;
}

/** 64 MB of base64 is ~48 MB of file: beyond what an exported diagram should ever be. */
export const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

export function decodeBase64(data: string): Uint8Array {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

/** The dialog gets a name, never a directory the caller chose. */
export function suggestFileName(filename: string): string {
    return filename.split(/[\\/]/).pop() || "";
}

function assertWritable(request: FileExportRequest, maxBytes: number): string {
    if (!request?.mimeType) {
        throw new Error("文件导出请求不合法：缺少 mimeType");
    }

    const suggestedName = suggestFileName(request?.filename || "");
    if (!suggestedName) {
        throw new Error("文件导出请求不合法：缺少文件名 filename");
    }

    if (!request.data) {
        throw new Error("文件导出请求不合法：缺少导出内容 data");
    }

    if (request.data.length > maxBytes) {
        throw new Error(`文件导出内容过大：${request.data.length} > ${maxBytes}`);
    }

    return suggestedName;
}

export type ElectronFileExporterDeps = {
    saveDialog: ExportSaveDialog;
    writeFile: ExportFileWriter;
    maxBytes?: number;
};

/**
 * ElectronFileExporter — real adapter at the FileExporter seam.
 * Asks where to put the file first (so a dismissed dialog costs nothing), then writes and
 * reports the path. Exports are serialized: one save dialog at a time.
 */
export class ElectronFileExporter implements FileExporter {
    private queue: Promise<unknown> = Promise.resolve();

    constructor(private deps: ElectronFileExporterDeps) {}

    exportFile(request: FileExportRequest, options: FileExportOptions = {}): Promise<FileExportResult> {
        const run = this.queue.then(
            () => this.exportNow(request, options),
            () => this.exportNow(request, options),
        );
        // Keep the queue alive after a failure without swallowing the caller's rejection.
        this.queue = run.catch(() => undefined);
        return run;
    }

    private async exportNow(request: FileExportRequest, options: FileExportOptions): Promise<FileExportResult> {
        const suggestedName = assertWritable(request, this.deps.maxBytes ?? DEFAULT_MAX_BYTES);
        const target = options.targetPath ?? (await this.deps.saveDialog.pick(suggestedName, request.mimeType));
        if (target == null) {
            return { status: "canceled" };
        }

        this.deps.writeFile(target, decodeBase64(request.data));
        return { status: "saved", path: target };
    }
}

/** FakeFileExporter — recording adapter at the same seam, for tests and wiring checks. */
export class FakeFileExporter implements FileExporter {
    readonly calls: Array<{ request: FileExportRequest; options?: FileExportOptions }> = [];

    constructor(private readonly result: FileExportResult | { error: string } = { status: "saved", path: "/fake/out.png" }) {}

    async exportFile(request: FileExportRequest, options?: FileExportOptions): Promise<FileExportResult> {
        this.calls.push({ request, options });
        if ("error" in this.result) {
            throw new Error(this.result.error);
        }
        return this.result;
    }
}

/**
 * Adapter for hosts without a local writer (mobile, browser). The bridge refuses the request
 * before it gets here, so this only turns a programming error into a readable message.
 */
export function unavailableFileExporter(reason = "本机保存仅在桌面端思源可用"): FileExporter {
    return {
        exportFile: async () => {
            throw new Error(reason);
        },
    };
}

/** Composition root for the local save channel, so callers only see the FileExporter seam. */
export function createElectronFileExporter(options: { maxBytes?: number } = {}): FileExporter {
    return new ElectronFileExporter({
        saveDialog: new SiYuanSaveDialog(),
        writeFile: writeFileToDisk,
        maxBytes: options.maxBytes,
    });
}