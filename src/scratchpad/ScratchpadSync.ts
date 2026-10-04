import { logger } from "@/logger";

/**
 * ScratchpadSync — owns the invariant that draw.io's scratchpad library
 * (draw.io's internal title for it is `.scratchpad`) is persisted under
 * SiYuan's DATA_PATH, not only in the browser profile.
 *
 * Why: draw.io keeps the scratchpad through `StorageFile`, which writes to the
 * browser's IndexedDB (`openDatabase('database')`) and falls back to
 * `localStorage['.scratchpad']`. Inside the plugin that store lives in the
 * SiYuan/Electron profile, so it never reaches `/data/`: no cloud sync, no
 * snapshot restore, and a second device starts empty. Re-routing the read/write
 * pair for this one title puts the library where the rest of the workspace lives.
 *
 * Depth: callers hand in the draw.io `StorageFile` constructor plus a read/write
 * pair of ports. Which titles are re-routed, mirror-first reads with a local
 * fallback, and keeping the local write intact are all private here.
 */

/** draw.io's internal title for the scratchpad library (see `EditorUi.toggleScratchpad`). */
export const SCRATCHPAD_TITLE = ".scratchpad";

/** Name of the mirrored library inside the plugin's petal directory. */
export const SCRATCHPAD_FILE_NAME = "scratchpad.xml";

export interface ScratchpadPorts {
    /** Resolve with the mirrored library XML; reject when there is no mirror yet. */
    read: () => Promise<string>;
    /** Persist the library XML. A rejected promise is reported, never fatal. */
    write: (xml: string) => Promise<unknown>;
}

/** The slice of draw.io's `StorageFile` this module patches. */
export interface StorageFileLike {
    getFileContent: (
        ui: unknown,
        title: string,
        success: (xml: string | null) => void,
        error?: (e?: unknown) => void,
    ) => unknown;
    prototype: {
        getData: () => string;
        writeFile: (title: string, success?: () => void, error?: (e?: unknown) => void) => unknown;
    };
}

export function isScratchpadTitle(title: unknown): boolean {
    return title === SCRATCHPAD_TITLE;
}

/**
 * Workspace-relative path (no `/data` prefix) of the mirrored scratchpad library.
 *
 * The storage directory is injected rather than imported: the client bundle only
 * needs this one string, and dragging `@/constants` into it costs ~1.4 kB of
 * unrelated constant tables (Rollup cannot drop the class' static initialisers).
 * Callers on the host side use `STORAGE_PATH` from `@/constants`; the draw.io
 * client already owns the same directory as `PETAL_DIR_PATH`.
 */
export function scratchpadPath(storagePath: string): string {
    return `${storagePath.replace(/\/+$/, "")}/${SCRATCHPAD_FILE_NAME}`;
}

/**
 * Re-route `StorageFile`'s read/write pair for the scratchpad title only; every
 * other library, and every other file, keeps upstream behaviour.
 */
export function installScratchpadSync(StorageFile: StorageFileLike | undefined | null, ports: ScratchpadPorts): void {
    if (StorageFile == null) return;

    const upstreamRead = StorageFile.getFileContent;

    StorageFile.getFileContent = function (
        ui: unknown,
        title: string,
        success: (xml: string | null) => void,
        error?: (e?: unknown) => void,
    ) {
        if (!isScratchpadTitle(title)) {
            return upstreamRead.call(StorageFile, ui, title, success, error);
        }

        const readLocal = () => upstreamRead.call(StorageFile, ui, title, success, error);

        // Mirror first: that is the copy SiYuan syncs across devices. No mirror
        // yet (first run on this device) or an unreachable kernel falls back to
        // the browser copy, so an existing scratchpad survives the upgrade.
        return ports.read().then(
            (xml) => {
                if (xml == null || xml === "") return readLocal();
                success(xml);
            },
            (e) => {
                logger.debug("ScratchpadSync: mirror unreadable, using local copy", e);
                return readLocal();
            },
        );
    };

    const upstreamWrite = StorageFile.prototype.writeFile;

    StorageFile.prototype.writeFile = function (
        this: { getData: () => string },
        title: string,
        success?: () => void,
        error?: (e?: unknown) => void,
    ) {
        if (!isScratchpadTitle(title)) {
            return upstreamWrite.call(this, title, success, error);
        }

        const file = this;

        // The local write still runs: it carries draw.io's own bookkeeping
        // (descriptor, autosave shadow state, sidebar refresh). The mirror rides
        // along after it and never fails the save — worst case the scratchpad is
        // only as durable as it was before this override.
        return upstreamWrite.call(
            this,
            title,
            function () {
                Promise.resolve()
                    .then(() => ports.write(file.getData()))
                    .catch((e) => logger.debug("ScratchpadSync: mirror write failed", e));
                if (success != null) success();
            },
            error,
        );
    };
}
