# 01: Establish domain seam — CONTEXT.md + AssetStore expand

**What to build:** Repo gains a shared domain vocabulary and a new deep module seam without breaking existing callers. End-to-end, a developer can import `AssetStore` and run a unit test through its interface without mocking Siyuan fetch per caller.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `CONTEXT.md` created at repo root defining `Asset`, `DrawioAsset`, `AssetStore`, `DrawioBridge` using codebase-design vocabulary (module/interface/seam/adapter)
- [ ] New module `src/asset/AssetStore.ts` exposes small interface `list/search/save/rename` hiding `DATA_PATH`, `STORAGE_PATH`, `drawioAssetsPath`, suffix invariant; old `src/api.ts` wrappers remain (expand phase)
- [ ] Two adapters at the seam: `SiyuanHttpAdapter` (delegates to existing `/api/*` via internal `request`) and `FakeAssetStore` (in-memory) proving seam is real (two adapters = real seam)
- [ ] Vitest unit test `src/asset/AssetStore.test.ts` exercises `list` through the interface using `FakeAssetStore`, no direct fetch mock
- [ ] `pnpm build` still green; no caller migrated yet
