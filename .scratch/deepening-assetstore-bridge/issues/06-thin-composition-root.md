# 06: Thin composition root

**What to build:** `DrawioPlugin` becomes a thin composition root that wires the deep modules together, with dock/dialog/tab as separate deep modules behind narrow interfaces.

**Blocked by:** 02: Dock lists assets through AssetStore, 03: Dialog search through AssetStore, 04: Create & rename through DrawioAsset value, 05: Typed DrawioBridge host-guest

**Status:** ready-for-agent

- [ ] Extract `DockModule` (`dock.refresh(assets)` / `dock.onOpen(cb)`), `AssetPickerDialog` (`picker.open({assets, onSelect})`), `TabManager` from `src/index.ts` (currently ~420 LOC)
- [ ] `src/index.ts` only does `new AssetStore(new SiyuanHttpAdapter())` → `new DrawioBridge(new SiyuanBridgeHost())` → inject into dock/dialog/tab; no direct `fetch`, path, or `postMessage` logic remains
- [ ] `renderAssetList` HTML-string building moved inside `AssetPickerDialog` with locality for keyboard nav and empty-state bugs; interface is the test surface (dialog test via `FakeAssetStore`, no CDP)
- [ ] Demo: all prior demos still work; `src/index.ts` <200 LOC; `pnpm build` and `pnpm e2e` full suite green
