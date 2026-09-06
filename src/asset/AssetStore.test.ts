import { describe, it, expect } from "vitest";
import { FakeAssetStore, SiyuanAssetStore } from "./AssetStore";
import { Asset } from "@/types";

const sample: Asset[] = [
    { path: "storage/petal/siyuan-drawio-plugin/beta-20240101-aaaaaaa.drawio", hName: "beta", updated: 2, ext: "drawio" },
    { path: "storage/petal/siyuan-drawio-plugin/alpha-20240101-bbbbbbb.drawio", hName: "alpha", updated: 1, ext: "drawio" },
    { path: "assets/drawio/gamma.drawio.png", hName: "gamma", updated: 3, ext: "png" },
];

describe("AssetStore — interface is the test surface (FakeAssetStore)", () => {
    it("list returns sorted copy and does not expose internal mutation (locality)", async () => {
        const store = new FakeAssetStore(sample);
        const listed = await store.list();
        expect(listed.map((a) => a.hName)).toEqual(["alpha", "beta", "gamma"]);
        // mutate returned array should not affect store
        listed.push({ path: "x", hName: "zzz", updated: 0, ext: "drawio" });
        const relisted = await store.list();
        expect(relisted).toHaveLength(3);
    });

    it("search filters case-insensitive on hName and path, empty returns all", async () => {
        const store = new FakeAssetStore(sample);
        expect(await store.search("", sample)).toHaveLength(3);
        expect((await store.search("ALP", sample)).map((a) => a.hName)).toEqual(["alpha"]);
        expect((await store.search("assets/drawio", sample)).map((a) => a.hName)).toEqual(["gamma"]);
        expect((await store.search("beta", sample)).map((a) => a.hName)).toEqual(["beta"]);
        expect(await store.search("zzz", sample)).toHaveLength(0);
    });

    it("search without assets param lists then filters (hides list detail, leverage)", async () => {
        const store = new FakeAssetStore(sample);
        const result = await store.search("alpha");
        expect(result.map((a) => a.hName)).toEqual(["alpha"]);
    });

    it("save generates STORAGE_PATH path and keeps store sorted", async () => {
        const store = new FakeAssetStore([]);
        const res = await store.save("my diagram");
        expect(res.succMap["my diagram.drawio"]).toMatch(/^storage\/petal\/siyuan-drawio-plugin\/my diagram-\d{14}-[a-z]{7}\.drawio$/);
        const listed = await store.list();
        expect(listed).toHaveLength(1);
        expect(listed[0].hName).toBe("my diagram");
        // second save keeps sorted invariant
        await store.save("aaa");
        expect((await store.list()).map((a) => a.hName)).toEqual(["aaa", "my diagram"]);
    });

    it("saveFile delegates to save with base name", async () => {
        const store = new FakeAssetStore([]);
        const file = new File([""], "hello.drawio", { type: "text/xml" });
        const res = await store.saveFile(file);
        expect(res.succMap["hello.drawio"]).toContain("hello-");
    });

    it("rename preserves -timestamp-random suffix (DrawioAsset invariant, locality)", async () => {
        const store = new FakeAssetStore([
            { path: "storage/petal/siyuan-drawio-plugin/old-20240101120000-abcdefg.drawio", hName: "old", updated: 1, ext: "drawio" },
        ]);
        await store.rename("newName", "storage/petal/siyuan-drawio-plugin/old-20240101120000-abcdefg.drawio");
        const listed = await store.list();
        expect(listed[0].path).toBe("storage/petal/siyuan-drawio-plugin/newName-20240101120000-abcdefg.drawio");
        expect(listed[0].hName).toBe("newName");
    });

    it("rename keeps sorted order", async () => {
        const store = new FakeAssetStore([
            { path: "storage/petal/siyuan-drawio-plugin/b-20240101-aaaaaaa.drawio", hName: "b", updated: 1, ext: "drawio" },
            { path: "storage/petal/siyuan-drawio-plugin/a-20240101-bbbbbbb.drawio", hName: "a", updated: 1, ext: "drawio" },
        ]);
        // rename a -> zzz should resort to b, zzz
        await store.rename("zzz", "storage/petal/siyuan-drawio-plugin/a-20240101-bbbbbbb.drawio");
        expect((await store.list()).map((a) => a.hName)).toEqual(["b", "zzz"]);
    });

    it("SiyuanAssetStore exposes same small interface (expand — old api still works)", async () => {
        // Just verify the adapter satisfies the interface without calling Siyuan backend
        const store = new SiyuanAssetStore();
        expect(typeof store.list).toBe("function");
        expect(typeof store.search).toBe("function");
        expect(typeof store.save).toBe("function");
        expect(typeof store.rename).toBe("function");
        // Deletion test: callers only need these 5 methods, not 40 request wrappers
    });
});
