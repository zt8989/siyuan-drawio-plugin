# 04: Create & rename through DrawioAsset value

**What to build:** Creating a new whiteboard and renaming an existing one both go through the deep value module `DrawioAsset`, so the `-YYYYMMDDHHMMSS-xxxxxxx` suffix invariant and `DATA_PATH` prefix are fixed in one place.

**Blocked by:** 02: Dock lists assets through AssetStore

**Status:** ready-for-agent

- [ ] New value module `src/asset/DrawioAsset.ts` (or inside `AssetStore`) with interface `fromPath/fromTitle`, `title`, `id`, `suffixedName`, `toLink`, `toIframeSrc` hiding `STORAGE_PATH`/`DATA_PATH` rules and suffix generation (`generateSiyuanId`)
- [ ] `AssetStore.save(title)` and `AssetStore.rename(oldPath, newTitle)` delegate to `DrawioAsset` for suffix preservation (fixes #42 space-in-filename class)
- [ ] `src/dialog.ts` and `src/components/dock.svelte` rename flow use `AssetStore.rename` instead of ad-hoc `parts.slice(-2)` logic
- [ ] Demo: dock "Add" → create `e2e-xxx` → file appears with correct suffix; rename preserves suffix; `pnpm e2e --grep "create new drawing"` green; unit test covers suffix round-trip with spaces
