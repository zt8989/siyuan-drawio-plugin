# Repository Guidelines

> 详述见 `docs/`：`docs/architecture.md`（结构与架构）、`docs/release.md`（发布）、`docs/contributing.md`（提交与配置）、`CONTEXT.md`（域词汇）

## Build, Test, and Development Commands
- `pnpm dev` — **必须后台运行**（`vite --watch` + livereload 常驻，不会退出；用 `pty_spawn`/`&` 后台启动，勿前台阻塞）watch build with inline sourcemaps via `concurrently` (`vite.config.ts` for src + `vite.client.config.ts` for client `PreConfig`/`PostConfig` as IIFE to `dev/webapp/js/`). `predev` copies draw.io webapp base to `dev/webapp/`. **只需 `pnpm dev` 即可**：`dev/` 已通过 `pnpm make-link` 一次性 `symlink -> <workspace>/data/plugins/siyuan-drawio-plugin`（`scripts/make_dev_link.js` 经 `getSiYuanDir` 或 `SIYUAN_PLUGIN_DIR` 解析），`vite --watch` 增量编译后自动同步到思源测试 workspace，无需手动 `copy` 到 `resources/test`；`dev` 与 `dist` 隔离，`build` 产 `dist/package.zip` 不影响 `dev`。
- `pnpm make-link` — **仅需一次**：将 `dev/` 软链到思源插件目录，后续 `pnpm dev` 自动同步。
- `pnpm build` — production bundle (`vite` + `vite.client.config.ts` both) `prebuild` copies draw.io base, `postbuild` runs `scripts/copy_and_bundle_build.js` to create `package.zip` (no manual IIFE wrapping – client IIFE is handled by Vite).
- `pnpm make-install` combines build + install. Use `pnpm update-version` to bump both `plugin.json` and `package.json`.
- **Siyuan cache**: Electron V8 caches compiled JS. If changes don't reflect, reload the Electron window (Shift+F5 or DevTools reload) instead of restarting SiYuan. Client sourcemap is now correct (Vite IIFE, not manual string wrap).

## Coding Style & Naming Conventions

4-space indentation in `.ts`. Prefer TypeScript interfaces over `any`. ESM only — no CommonJS imports. Vite resolves via `@/` alias → `src/`. Svelte 4 with `@sveltejs/vite-plugin-svelte`.

## Testing Guidelines

> **铁律：E2E 必须先探后固化 — 不允许直接编写 e2e**
> 1. 任何新增/修改 `e2e/` 用例前，**必须先通过 Playwright MCP 或 `playwright-cli` skill 在真实 Siyuan/Electron 环境中探明并验证交互路径**（CDP `http://127.0.0.1:9222`，需 SiYuan 以 `--remote-debugging-port=9222` 启动）。
> 2. 只有在 Playwright 交互已跑通后，才可将路径固化为 `e2e/` 内的可复现脚本（`pnpm e2e`，`vitest` + `playwright`，`e2e/drawio.test.ts`，30s timeout）。
> 3. **禁止直接手写/猜测 e2e 用例**（含选择器、时序、Dialog/Dock 挂载逻辑）而不经过浏览器实测验证；评审时以 Playwright 实测轨迹为依据。

No automated tests beyond E2E. Manual verification in Siyuan: `pnpm dev` → `pnpm make-link` → insert `/drawio`. Test save, upload, rename, "Copy as Image". For E2E automation, use `pnpm e2e` (`vitest` + `playwright` via CDP `http://127.0.0.1:9222`, `e2e/drawio.test.ts`, 30s timeout; requires SiYuan started with `--remote-debugging-port=9222`).
