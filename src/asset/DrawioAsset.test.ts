import { describe, it, expect } from "vitest";
import { DrawioAsset } from "./DrawioAsset";
import { STORAGE_PATH } from "@/constants";

describe("DrawioAsset — deep value module (single source of truth for suffix/path)", () => {
    it("generateId follows -YYYYMMDDHHMMSS-xxxxxxx invariant", () => {
        const id = DrawioAsset.generateId();
        expect(id).toMatch(/^\d{14}-[a-z]{7}$/);
    });

    it("fromTitle generates STORAGE_PATH path with suffix and hName", () => {
        const asset = DrawioAsset.fromTitle("my diagram");
        expect(asset.hName).toBe("my diagram");
        expect(asset.ext).toBe("drawio");
        expect(asset.path).toMatch(/^storage\/petal\/siyuan-drawio-plugin\/my diagram-\d{14}-[a-z]{7}\.drawio$/);
        expect(asset.id).toMatch(/^\d{14}-[a-z]{7}$/);
        expect(asset.dataPath()).toBe(`/data/${asset.path}`);
    });

    it("fromTitle strips .drawio if provided", () => {
        const asset = DrawioAsset.fromTitle("hello.drawio");
        expect(asset.hName).toBe("hello");
        expect(asset.path).toContain("hello-");
    });

    it("fromPath parses hName, ext, id (locality: one place for slicing)", () => {
        const path = `${STORAGE_PATH}/alpha-20240101120000-abcdefg.drawio`;
        const asset = DrawioAsset.fromPath(path);
        expect(asset.hName).toBe("alpha");
        expect(asset.id).toBe("20240101120000-abcdefg");
        expect(asset.ext).toBe("drawio");
        expect(asset.filename).toBe("alpha-20240101120000-abcdefg.drawio");
    });

    it("fromPath handles space in filename (fix for #42)", () => {
        const path = `${STORAGE_PATH}/my diagram-20240101120000-abcdefg.drawio`;
        const asset = DrawioAsset.fromPath(path);
        expect(asset.hName).toBe("my diagram");
        expect(asset.id).toBe("20240101120000-abcdefg");
    });

    it("fromPath handles compound ext .drawio.png", () => {
        const path = `assets/drawio/foo-20240101-aaaaaaa.drawio.png`;
        const asset = DrawioAsset.fromPath(path);
        expect(asset.ext).toBe("png");
        // hName should be before -id, without .drawio
        expect(asset.hName).toBe("foo");
    });

    it("renamePath preserves -id suffix", () => {
        const old = `${STORAGE_PATH}/old-20240101120000-abcdefg.drawio`;
        const next = DrawioAsset.renamePath("newName", old);
        expect(next).toBe(`${STORAGE_PATH}/newName-20240101120000-abcdefg.drawio`);
    });

    it("renamePath with newName containing .drawio", () => {
        const old = `${STORAGE_PATH}/old-20240101-aaaaaaa.drawio`;
        const next = DrawioAsset.renamePath("new.drawio", old);
        expect(next).toBe(`${STORAGE_PATH}/new-20240101-aaaaaaa.drawio`);
    });

    it("extractId delegates (used by renderAssets)", () => {
        expect(DrawioAsset.extractId("foo-20240101120000-abcdefg")).toBe("20240101120000-abcdefg");
        expect(DrawioAsset.extractId("no-id")).toBeNull();
    });

    it("toLink generates siyuan link (hides URLSearchParams)", () => {
        const asset = DrawioAsset.fromPath(`${STORAGE_PATH}/alpha-20240101-aaaaaaa.drawio`);
        const link = asset.toLink();
        expect(link).toContain("siyuan://plugins/siyuan-drawio-plugin");
        expect(link).toContain("alpha-20240101-aaaaaaa.drawio");
    });
});
