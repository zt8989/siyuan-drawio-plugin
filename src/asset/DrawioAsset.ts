import { STORAGE_PATH, DATA_PATH, DRAWIO_EXTENSION } from "@/constants";

/**
 * DrawioAsset — deep value module for asset identity.
 * Small interface hides: STORAGE_PATH/DATA_PATH prefix rules, ext handling,
 * -YYYYMMDDHHMMSS-xxxxxxx suffix invariant, and conversions path↔title↔link↔iframe.
 * Deletion test: removing it re-creates slicing logic in 5 callers (link.ts, renderAssets, api.ts).
 */
export class DrawioAsset {
    readonly path: string; // without DATA_PATH prefix, e.g. storage/petal/.../title-20200101-aaaaaaa.drawio
    readonly hName: string;
    readonly ext: string; // final ext without dot, e.g. "drawio"
    readonly id: string; // suffix part e.g. "20240101120000-abcdefg" or ""
    readonly filename: string;

    private constructor(path: string, hName: string, ext: string, id: string) {
        this.path = path;
        this.hName = hName;
        this.ext = ext;
        this.id = id;
        this.filename = path.split("/").pop() || "";
    }

    /** Generate -YYYYMMDDHHMMSS-xxxxxxx suffix id */
    static generateId(): string {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const rand = Array.from({ length: 7 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
        return `${ts}-${rand}`;
    }

    /** Extract id via regex /(\d{14}-[a-z]{7})$/ or fallback /(\d+-\w+)$/ — as in renderAssets:extractId */
    static extractId(nameWithoutExt: string): string | null {
        // Prefer strict 14-digit timestamp + 7 letters; fallback to loose for legacy files
        const strict = nameWithoutExt.match(/(\d{14}-[a-z]{7})$/);
        if (strict) return strict[1];
        const loose = nameWithoutExt.match(/(\d+-\w+)$/);
        return loose ? loose[1] : null;
    }

    /** Build from stored path (without DATA_PATH prefix) */
    static fromPath(path: string): DrawioAsset {
        const filename = path.split("/").pop() || "";
        // find ext (handles .drawio.png etc — take last dot segment, but need full ext detection)
        // For stored path, filename ends with .drawio or .drawio.png etc; we treat ext as final segment after dot
        // and hName as base without suffix+ext
        const lastDot = filename.lastIndexOf(".");
        const ext = lastDot >= 0 ? filename.slice(lastDot + 1) : "";
        // For suffix extraction, strip the final ext then find id
        // e.g. "foo-20240101-aaaaaaa.drawio.png" → withoutExt = "foo-20240101-aaaaaaa.drawio" → need to strip all known?
        // Simpler: strip at last dot for id check, but also handle .drawio intermediate
        const withoutFinalExt = lastDot >= 0 ? filename.slice(0, lastDot) : filename;
        // If filename is like "foo-...drawio" then withoutFinalExt still contains ".drawio" inner — treat specially
        // For drawio compound exts, we keep ext as final, but hName should be before -id
        let baseForId = withoutFinalExt;
        // if compound like "a-20240101-aaa.drawio" then baseForId = "a-20240101-aaa.drawio" contains ".drawio" → need to strip that too for id
        if (withoutFinalExt.endsWith(".drawio")) {
            baseForId = withoutFinalExt.slice(0, -".drawio".length);
        }
        const id = DrawioAsset.extractId(baseForId) || DrawioAsset.extractId(withoutFinalExt) || "";
        // Derive hName: strip -id suffix if present
        let hName: string;
        if (id) {
            // remove "-"+id from base
            const idx = baseForId.lastIndexOf(`-${id}`);
            hName = idx >= 0 ? baseForId.slice(0, idx) : baseForId;
            // if we stripped .drawio earlier, need to ensure hName not contain it
            if (hName.endsWith(".drawio")) hName = hName.slice(0, -".drawio".length);
        } else {
            // no id — hName is filename without ext (and without compound)
            hName = withoutFinalExt;
            if (hName.endsWith(".drawio")) hName = hName.slice(0, -".drawio".length);
        }
        return new DrawioAsset(path, hName, ext, id);
    }

    /** Build new asset from title, generating id and path under savePath (default STORAGE_PATH). Handles title with or without .drawio */
    static fromTitle(title: string, savePath: string = STORAGE_PATH, ext: string = DRAWIO_EXTENSION): DrawioAsset {
        if (!title) throw new Error(`Drawio: 名称 ${title} 不合法`);
        // strip .drawio if provided
        const base = title.endsWith(ext) ? title.slice(0, -ext.length) : title;
        const id = DrawioAsset.generateId();
        const filename = `${base}-${id}${ext}`;
        const path = `${savePath}/${filename}`;
        return new DrawioAsset(path, base, ext.replace(/^\./, ""), id);
    }

    /** Build rename target path preserving -id suffix from oldPath */
    static renamePath(newName: string, oldPath: string): string {
        if (!newName) throw new Error(`Drawio: 名称 ${newName} 不合法`);
        const old = DrawioAsset.fromPath(oldPath);
        const oldFileName = old.filename;
        const prefix = old.path.slice(0, -oldFileName.length);
        // newName may include .drawio — normalize
        const newBase = newName.endsWith(DRAWIO_EXTENSION) ? newName.slice(0, -DRAWIO_EXTENSION.length) : newName;
        const suffix = old.id ? `-${old.id}` : "";
        const newFile = `${newBase}${suffix}${DRAWIO_EXTENSION}`;
        return prefix + newFile;
    }

    /** Data path prefixed */
    dataPath(): string {
        return DATA_PATH + this.path;
    }

    /** Create Siyuan link for this asset */
    toLink(): string {
        const title = this.filename;
        const urlParams = new URLSearchParams({
            icon: "iconDrawio",
            title,
            data: JSON.stringify({ url: this.path }),
        });
        return `[${title}](siyuan://plugins/siyuan-drawio-plugin?${urlParams.toString()})`;
    }

    /** Get title from path helper (delegates to DrawioAsset) — for backward compat */
    static titleFromPath(path: string): string {
        return path.split("/").pop() || "";
    }
}
