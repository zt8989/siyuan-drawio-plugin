# 02: Dock lists assets through AssetStore

**What to build:** Opening the draw.io dock shows a sorted list of drawio files sourced exclusively through the new `AssetStore` interface. The dock no longer calls raw `readDir`/`request` directly.

**Blocked by:** 01: Establish domain seam — CONTEXT.md + AssetStore expand

**Status:** ready-for-agent

- [ ] `src/components/dock.svelte` (and its loader in `src/index.ts`) calls `AssetStore.list()` via injected adapter instead of `src/api.ts:listDrawioFiles`
- [ ] Sorting, multi-ext handling (`.drawio`, `.drawio.png/svg/html`) and prefix stripping verified through `AssetStore` interface, not duplicated in dock
- [ ] Unit test with `FakeAssetStore` proves dock refresh works without Siyuan backend
- [ ] Demo: `pnpm dev` → click toolbar draw.io icon → dock lists files; `pnpm e2e` dock test still green
