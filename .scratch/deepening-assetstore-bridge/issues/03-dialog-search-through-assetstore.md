# 03: Dialog search through AssetStore

**What to build:** The "Select drawio" dialog filters assets as the user types by delegating to `AssetStore.search(k)`, consolidating the previous scattered filter logic.

**Blocked by:** 02: Dock lists assets through AssetStore

**Status:** ready-for-agent

- [ ] `src/index.ts:renderAssetList` and `showOpenDialog` call `AssetStore.search(k, assets)` (or `AssetStore.list` with query) instead of `src/api.ts:searchDrawioFiles`
- [ ] Dialog handles empty-state and stale-input cases via the same interface, no HTML-string duplication in caller
- [ ] Keyboard navigation (`upDownHint`) still works; filtering proven through interface test with `FakeAssetStore` containing 10+ assets
- [ ] Demo: open slash `/drawio` → type prefix in dialog → filtered `b3-list-item` appears; `pnpm e2e` dialog/search test green
