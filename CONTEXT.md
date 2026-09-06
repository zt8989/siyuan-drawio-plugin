# CONTEXT.md — Siyuan Drawio Plugin Domain Glossary

> Vocabulary for deep modules and seams. Use these terms exactly when naming modules, interfaces, and tickets.

## Core Domain

**Asset** — A draw.io diagram file as stored in Siyuan. Persisted under `DATA_PATH` (`/data/`) with prefix `STORAGE_PATH` (`storage/petal/siyuan-drawio-plugin`) or `drawioAssetsPath` (`assets/drawio`). Represented by `{ path, hName, updated, ext }`. The `path` is without `/data/` prefix; `hName` is human name without `-timestamp-random` suffix.

**DrawioAsset** — Value module for asset identity. Owns the invariants: file extension handling (`.drawio`, `.drawio.png/svg/html`, `.svg`, `.png`), suffix generation (`-YYYYMMDDHHMMSS-xxxxxxx` via `generateSiyuanId`), prefix rules (`DATA_PATH`/`STORAGE_PATH`), and conversions `path ↔ link ↔ iframeSrc ↔ title ↔ id`. Deep: small interface (`fromPath`, `fromTitle`, `toLink`, `toIframeSrc`) hides all path/id logic.

**AssetStore** — Deep module owning asset persistence. Interface: `list(dirs?)`, `search(keyword, assets?)`, `save(title, savePath?)`, `saveFile(file, savePath?)`, `rename(newName, oldPath)`. Hides scan/sort/filter, `readDir`/`putFile`/`renameFile` HTTP details, and suffix handling via `DrawioAsset`. External seam at `AssetStore`; internal seam at file-system port. Adapters: `SiyuanAssetStore` (real, delegates to `src/api.ts`), `FakeAssetStore` (in-memory, for tests). *One adapter = hypothetical seam, two = real*.

**DrawioBridge** — Deep module owning the Siyuan host ↔ draw.io guest contract. Interface: typed `BridgeMessage` union (`NEW_TYPE`/`OPEN_TYPE`/`UPDATE_TITLE`/`COPY_LINK`/`OPEN_TAB_BY_PATH`) with validation. Hides `urlParams` mutation, `DRAWIO_BASE_URL`/`DRAWIO_VIEWER_URL`, `getLang()` BCP-47 mapping (`zh-CN` → `zh`), and `Electron`/`Storage` sync. Adapters: `SiyuanBridgeHost` (plugin side), `DrawioBridgeGuest` (client `PreConfig`/`PostConfig` side). Inner adapters: `Electron.js`, `Storage.js`.

## Supporting Concepts

**DrawioDocument** — Logical document opened in a tab/iframe, identified by `Asset` + `AssetStore` path. Distinct from `Asset` (stored file).

**WebappPublisher** — Deep module owning the invariant that `PreConfig`/`PostConfig` are published as IIFE to `dist/webapp/js/` with correct sourcemap and `embed.html` to `webapp/`. Vite configs and `copy_and_bundle_build.js` are adapters at its internal seam.

**DockModule / AssetPickerDialog / TabManager** — UI deep modules composed by `DrawioPlugin` (thin composition root). Each has narrow interface: `dock.refresh(assets)`, `picker.open({assets, onSelect})`, `tabs.open(path)`.

## Excluded (not domain)

Generic Siyuan concepts (`Notebook`, `Block`, `Protyle`) remain in `siyuan` SDK, not redefined here.
