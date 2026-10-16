/**
 * SaveTarget — the shared save tail for local exports (issues #75 and #76).
 *
 * Both export channels end the same way: ask the user for a path, then write bytes. The PDF
 * channel produces its bytes in a hidden window, the file channel receives them from the
 * editor, so only this tail is shared. Both seams take it as an injected port, which keeps
 * their unit tests free of Electron.
 */

export interface ExportSaveDialog {
    /** Resolves null when the user dismisses the dialog. */
    pick(defaultName: string, mimeType: string): Promise<string | null>;
}

export type ExportFileWriter = (path: string, bytes: Uint8Array) => void;

type DialogFilter = { name: string; extensions: string[] };

/** Cosmetic only (macOS/Linux show it in the native dialog); the extension drives it. */
const FILTERS: Record<string, DialogFilter> = {
    png: { name: "PNG", extensions: ["png"] },
    jpg: { name: "JPEG", extensions: ["jpg", "jpeg"] },
    jpeg: { name: "JPEG", extensions: ["jpg", "jpeg"] },
    webp: { name: "WebP", extensions: ["webp"] },
    gif: { name: "GIF", extensions: ["gif"] },
    svg: { name: "SVG", extensions: ["svg"] },
    xml: { name: "XML", extensions: ["xml"] },
    drawio: { name: "draw.io", extensions: ["drawio", "xml"] },
    html: { name: "HTML", extensions: ["html", "htm"] },
    json: { name: "JSON", extensions: ["json"] },
    txt: { name: "Text", extensions: ["txt"] },
    pdf: { name: "PDF", extensions: ["pdf"] },
};

function extensionOf(defaultName: string): string {
    const dot = defaultName.lastIndexOf(".");
    return dot >= 0 ? defaultName.slice(dot + 1).toLowerCase() : "";
}

function filtersFor(defaultName: string, mimeType: string): DialogFilter[] {
    const byExtension = FILTERS[extensionOf(defaultName)];
    if (byExtension) return [byExtension];

    const byMimeType = FILTERS[(mimeType.split("/").pop() || "").toLowerCase()];
    return byMimeType ? [byMimeType] : [];
}

/** SiYuan's main process owns the native save dialog; asking it keeps the plugin dialog-free. */
export class SiYuanSaveDialog implements ExportSaveDialog {
    async pick(defaultName: string, mimeType: string): Promise<string | null> {
        const { ipcRenderer } = require("electron");
        const result = await ipcRenderer.invoke("siyuan-get", {
            cmd: "showSaveDialog",
            title: mimeType === "application/pdf" ? "导出 PDF" : "导出文件",
            defaultPath: defaultName,
            filters: filtersFor(defaultName, mimeType),
        });

        return result?.canceled || !result?.filePath ? null : result.filePath;
    }
}

export const writeFileToDisk: ExportFileWriter = (path, bytes) => {
    const fs = require("fs");
    fs.writeFileSync(path, bytes);
};