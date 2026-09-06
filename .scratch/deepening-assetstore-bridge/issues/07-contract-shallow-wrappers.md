# 07: Contract — delete shallow wrappers

**What to build:** The old shallow helpers that were kept during the expand phase are deleted, so the codebase has a single source of truth for asset identity and HTTP access.

**Blocked by:** 02: Dock lists assets through AssetStore, 03: Dialog search through AssetStore, 04: Create & rename through DrawioAsset value, 05: Typed DrawioBridge host-guest, 06: Thin composition root

**Status:** ready-for-agent

- [ ] Delete or make private: `src/link.ts` split helpers (`getTitleFromPath` duplication), `src/asset/renderAssets.ts:extractId`/`getIdFromTitle`, duplicated suffix slicing in `src/api.ts` (`parts.slice(-2)` in `scanDirectory`/`renameDrawIo`), thin `request` re-exports
- [ ] Callers now only use `DrawioAsset`/`AssetStore`/`DrawioBridge`; `grep -r "extractId|getIdFromTitle|parts.slice(-2)" src/` yields only the deep module (or zero if inlined)
- [ ] No behavior change: `pnpm build` and `pnpm e2e` green; old forms no longer exist to be misused
- [ ] Update `CONTEXT.md` to mark `DrawioAsset` as the canonical asset identity module
