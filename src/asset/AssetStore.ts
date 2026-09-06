import { Asset } from "@/types";
import {
    listDrawioFiles,
    searchDrawioFiles,
    saveDrawIoXml,
    saveDrawIo,
    renameDrawIo,
} from "@/api";
import { STORAGE_PATH } from "@/constants";

/**
 * AssetStore — deep module owning asset persistence.
 *
 * External seam: AssetStore interface (what callers and tests use).
 * Internal seam: Siyuan HTTP via src/api.ts (request/readDir/putFile) — private to implementation.
 * Two adapters at external seam → real seam: SiyuanAssetStore (real) and FakeAssetStore (in-memory for tests).
 *
 * Depth: small interface (5 methods) hides scan/sort/filter, DATA_PATH prefix, STORAGE_PATH default,
 *        DrawioAsset suffix invariant, and HTTP details. Deletion test: removing it re-creates
 *        duplication in dock/dialog/index callers.
 */
export interface AssetStore {
    /** List drawio assets, sorted by hName. Hides DATA_PATH/STORAGE_PATH and ext handling. */
    list(dirs?: Record<string, string[]>): Promise<Asset[]>;
    /** Search within assets (or list-then-search if assets not supplied). Case-insensitive on hName/path. */
    search(keyword: string, assets?: Asset[]): Promise<Asset[]>;
    /** Save new drawio XML under title (generates -timestamp-random suffix). Default savePath = STORAGE_PATH. */
    save(title: string, savePath?: string): Promise<{ succMap: Record<string, string> }>;
    /** Save from File object (keeps original name minus extension, adds suffix). */
    saveFile(file: File, savePath?: string): Promise<{ succMap: Record<string, string> }>;
    /** Rename asset preserving -timestamp-random suffix. oldPath without DATA_PATH prefix as in Asset.path. */
    rename(newName: string, oldPath: string): Promise<unknown>;
}

/**
 * SiyuanAssetStore — real adapter at the AssetStore seam.
 * Delegates to src/api.ts (which owns the Siyuan HTTP). No caller needs to know URLs or FormData.
 */
export class SiyuanAssetStore implements AssetStore {
    async list(dirs?: Record<string, string[]>): Promise<Asset[]> {
        return listDrawioFiles(dirs);
    }

    async search(keyword: string, assets?: Asset[]): Promise<Asset[]> {
        const source = assets ?? (await this.list());
        return searchDrawioFiles(keyword, source);
    }

    async save(title: string, savePath: string = STORAGE_PATH): Promise<{ succMap: Record<string, string> }> {
        return saveDrawIoXml(title, savePath);
    }

    async saveFile(file: File, savePath: string = STORAGE_PATH): Promise<{ succMap: Record<string, string> }> {
        return saveDrawIo(file, savePath);
    }

    async rename(newName: string, oldPath: string): Promise<unknown> {
        return renameDrawIo(newName, oldPath);
    }
}

/**
 * FakeAssetStore — in-memory adapter at the same seam. The interface is the test surface:
 * tests exercise list/search/save/rename without mocking fetch per caller.
 */
export class FakeAssetStore implements AssetStore {
    private assets: Asset[];

    constructor(initial: Asset[] = []) {
        // copy and keep sorted invariant like real store
        this.assets = [...initial].sort((a, b) => a.hName.localeCompare(b.hName, undefined, { numeric: true, sensitivity: "base" }));
    }

    private sort() {
        this.assets.sort((a, b) => a.hName.localeCompare(b.hName, undefined, { numeric: true, sensitivity: "base" }));
    }

    async list(): Promise<Asset[]> {
        // return copy to preserve locality — callers cannot mutate internal state
        return [...this.assets];
    }

    async search(keyword: string, assets?: Asset[]): Promise<Asset[]> {
        const source = assets ?? this.assets;
        if (!keyword) return [...source];
        const lower = keyword.toLowerCase();
        return source.filter((a) => a.hName.toLowerCase().includes(lower) || a.path.toLowerCase().includes(lower));
    }

    async save(title: string, savePath: string = STORAGE_PATH): Promise<{ succMap: Record<string, string> }> {
        if (!title || /[\\/:*?"<>|]/.test(title)) {
            throw new Error(`Drawio: 名称 ${title} 不合法`);
        }
        // mimic generateSiyuanId suffix without importing api (keep fake self-contained)
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const rand = Array.from({ length: 7 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
        const suffix = `${ts}-${rand}`;
        const filename = `${title}-${suffix}.drawio`;
        const path = `${savePath}/${filename}`;
        const asset: Asset = { path, hName: title, updated: Date.now(), ext: "drawio" };
        this.assets.push(asset);
        this.sort();
        return { succMap: { [`${title}.drawio`]: path } };
    }

    async saveFile(file: File, savePath: string = STORAGE_PATH): Promise<{ succMap: Record<string, string> }> {
        const base = file.name.replace(/\.drawio$/, "");
        return this.save(base, savePath);
    }

    async rename(newName: string, oldPath: string): Promise<unknown> {
        if (!newName || /[\\/:*?"<>|]/.test(newName)) {
            throw new Error(`Drawio: 名称 ${newName} 不合法`);
        }
        const idx = this.assets.findIndex((a) => a.path === oldPath);
        if (idx === -1) throw new Error(`Asset not found: ${oldPath}`);
        const old = this.assets[idx];
        // preserve suffix as real renameDrawIo does: keep last two dash segments if present
        const oldFileName = old.path.split("/").pop() || "";
        const parts = oldFileName.split("-");
        const suffix = parts.length >= 3 ? `-${parts.slice(-2).join("-")}` : "";
        const newFile = newName.endsWith(".drawio") ? newName : newName + suffix;
        const prefix = old.path.slice(0, -oldFileName.length);
        const newPath = prefix + newFile;
        // hName is without suffix
        const newHName = newName.replace(/\.drawio$/, "");
        this.assets[idx] = { ...old, path: newPath, hName: newHName };
        this.sort();
        return { newPath };
    }

    /** Test helper — seed directly */
    seed(assets: Asset[]) {
        this.assets = [...assets];
        this.sort();
    }
}

/** Convenience: default real instance for production wiring */
export const defaultAssetStore: AssetStore = new SiyuanAssetStore();
