import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { STORAGE_PATH } from "@/constants";
import {
    SCRATCHPAD_FILE_NAME,
    SCRATCHPAD_TITLE,
    installScratchpadSync,
    isScratchpadTitle,
    scratchpadPath,
    type ScratchpadPorts,
    type StorageFileLike,
} from "./ScratchpadSync";

/**
 * The scratchpad is a draw.io *library* (title `.scratchpad`) whose storage is
 * upstream `StorageFile`: IndexedDB in the browser profile, localStorage as a
 * fallback. Issue #45 asks for that data to land in SiYuan's data directory
 * instead. These tests pin the contract of the override: exactly one title is
 * re-routed, the mirror wins when it exists, the local copy still backs it up.
 */

type Fake = {
    file: StorageFileLike;
    /** Titles that reached the upstream (local) read. */
    localReads: string[];
    /** Titles that reached the upstream write, with the data written. */
    localWrites: Array<{ title: string; xml: string }>;
    /** Call upstream write on a throwaway StorageFile instance. */
    writeAs: (xml: string, title: string, success?: () => void, error?: (e?: unknown) => void) => unknown;
    localXml: { value: string | null };
};

function makeFakeStorageFile(): Fake {
    const localReads: string[] = [];
    const localWrites: Array<{ title: string; xml: string }> = [];
    const localXml: { value: string | null } = { value: "<mxlibrary>[local]</mxlibrary>" };

    const proto = {
        data: "",
        getData(this: { data: string }) {
            return this.data;
        },
        writeFile(this: { data: string }, title: string, success?: () => void) {
            localWrites.push({ title, xml: this.data });
            if (success != null) success();
        },
    };

    const file = {
        getFileContent(_ui: unknown, title: string, success: (xml: string | null) => void) {
            localReads.push(title);
            success(localXml.value);
        },
        prototype: proto,
    } as unknown as StorageFileLike;

    return {
        file,
        localReads,
        localWrites,
        localXml,
        writeAs(xml, title, success, error) {
            const instance = Object.create(proto) as { data: string; writeFile: StorageFileLike["prototype"]["writeFile"] };
            instance.data = xml;
            return instance.writeFile(title, success, error);
        },
    };
}

function makePorts(overrides: Partial<ScratchpadPorts> = {}) {
    const written: string[] = [];
    const ports: ScratchpadPorts = {
        read: async () => "<mxlibrary>[mirror]</mxlibrary>",
        write: async (xml: string) => {
            written.push(xml);
            return { code: 0 };
        },
        ...overrides,
    };
    return { ports, written };
}

const read = (file: StorageFileLike, title: string) =>
    new Promise<string | null>((resolve, reject) => {
        file.getFileContent(null, title, resolve, reject);
    });

describe("scratchpadPath", () => {
    it("mirrors the library into the plugin petal directory", () => {
        expect(scratchpadPath(STORAGE_PATH)).toBe(`storage/petal/siyuan-drawio-plugin/${SCRATCHPAD_FILE_NAME}`);
    });

    it("tolerates a trailing slash on the storage path", () => {
        expect(scratchpadPath("storage/petal/x/")).toBe(`storage/petal/x/${SCRATCHPAD_FILE_NAME}`);
    });

    it("recognises only draw.io's scratchpad title", () => {
        expect(isScratchpadTitle(SCRATCHPAD_TITLE)).toBe(true);
        expect(isScratchpadTitle("myLibrary")).toBe(false);
        expect(isScratchpadTitle(undefined)).toBe(false);
    });
});

/**
 * The client half is a source file, so pin the wiring by reading it — same
 * pattern as `src/webappAssets.test.ts`. The caller injects the storage
 * directory, and the draw.io client owns that directory as `PETAL_DIR_PATH`
 * (a literal it already used for asset paths). Drift between the two copies
 * would silently split the scratchpad mirror from the plugin's data dir.
 */
describe("client/PostConfig.js wiring", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "client", "PostConfig.js"), "utf8");

    it("installs the scratchpad mirror on the draw.io StorageFile global", () => {
        expect(source).toContain("installScratchpadSync(globalThis.StorageFile, {");
    });

    it("routes both halves through the petal directory the host uses", () => {
        expect(source).toContain("scratchpadPath(PETAL_DIR_PATH)");

        const petalDir = /const PETAL_DIR_PATH = "([^"]+)";/.exec(source)?.[1];
        expect(petalDir).toBe(`${STORAGE_PATH}/`);
    });
});

describe("installScratchpadSync", () => {
    it("is a no-op when the host draw.io build exposes no StorageFile", () => {
        expect(() => installScratchpadSync(undefined, makePorts().ports)).not.toThrow();
    });

    it("leaves other libraries on the upstream local store", async () => {
        const fake = makeFakeStorageFile();
        const { ports, written } = makePorts();
        installScratchpadSync(fake.file, ports);

        expect(await read(fake.file, "myLibrary")).toBe("<mxlibrary>[local]</mxlibrary>");
        expect(fake.localReads).toEqual(["myLibrary"]);

        fake.writeAs("<mxlibrary>other</mxlibrary>", "myLibrary");
        expect(fake.localWrites).toEqual([{ title: "myLibrary", xml: "<mxlibrary>other</mxlibrary>" }]);
        expect(written).toEqual([]);
    });

    it("reads the scratchpad from the mirror, not the browser profile", async () => {
        const fake = makeFakeStorageFile();
        const { ports } = makePorts();
        installScratchpadSync(fake.file, ports);

        expect(await read(fake.file, SCRATCHPAD_TITLE)).toBe("<mxlibrary>[mirror]</mxlibrary>");
        expect(fake.localReads).toEqual([]);
    });

    it("falls back to the local scratchpad when the mirror does not exist yet", async () => {
        const fake = makeFakeStorageFile();
        const { ports } = makePorts({
            read: async () => {
                throw new Error("stat /data/.../scratchpad.xml: no such file");
            },
        });
        installScratchpadSync(fake.file, ports);

        expect(await read(fake.file, SCRATCHPAD_TITLE)).toBe("<mxlibrary>[local]</mxlibrary>");
        expect(fake.localReads).toEqual([SCRATCHPAD_TITLE]);
    });

    it("treats an empty mirror as no mirror", async () => {
        const fake = makeFakeStorageFile();
        const { ports } = makePorts({ read: async () => "" });
        installScratchpadSync(fake.file, ports);

        expect(await read(fake.file, SCRATCHPAD_TITLE)).toBe("<mxlibrary>[local]</mxlibrary>");
    });

    it("writes the scratchpad both locally and into the mirror", async () => {
        const fake = makeFakeStorageFile();
        const { ports, written } = makePorts();
        installScratchpadSync(fake.file, ports);

        const done: string[] = [];
        fake.writeAs("<mxlibrary>[new]</mxlibrary>", SCRATCHPAD_TITLE, () => done.push("saved"));

        expect(done).toEqual(["saved"]);
        expect(fake.localWrites).toEqual([{ title: SCRATCHPAD_TITLE, xml: "<mxlibrary>[new]</mxlibrary>" }]);
        await Promise.resolve();
        expect(written).toEqual(["<mxlibrary>[new]</mxlibrary>"]);
    });

    it("still reports success when the mirror write fails", async () => {
        const fake = makeFakeStorageFile();
        const { ports } = makePorts({
            write: async () => {
                throw new Error("kernel unreachable");
            },
        });
        installScratchpadSync(fake.file, ports);

        const done: string[] = [];
        const failure = new Error("should not surface");
        fake.writeAs(
            "<mxlibrary>[new]</mxlibrary>",
            SCRATCHPAD_TITLE,
            () => done.push("saved"),
            () => {
                throw failure;
            },
        );
        await new Promise((r) => setTimeout(r, 0));

        expect(done).toEqual(["saved"]);
        expect(fake.localWrites).toHaveLength(1);
    });
});
