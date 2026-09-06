# Repository Guidelines

## Project Structure & Module Organization
`src/` hosts the TypeScript + Svelte runtime. Key helpers: `src/link.ts` (URL generation), `src/asset/renderAssets.ts` (iframe HTML), `src/api.ts` (Siyuan API calls). Draw.io upstream assets and bridge scripts live in `drawio/` and `client/` (`PostConfig.js`, `PreConfig.js`, `embed.html`, `embed2.js`). Public files for Vite in `public/`. Build configs: `vite.config.ts` for `src/` → `dev/index.js`/`dist/index.js`, `vite.client.config.ts` for `client/` → `dev/webapp/js/`/`dist/webapp/js/` as IIFE with inline sourcemap (separated to keep sourcemap alignment). Build artifacts in `dev/` (hot reload) and `dist/` (production). Symlink utilities in `scripts/`.

## Build, Test, and Development Commands
- `pnpm dev` — watch build with inline sourcemaps via `concurrently` (`vite.config.ts` for src + `vite.client.config.ts` for client `PreConfig`/`PostConfig` as IIFE to `dev/webapp/js/`). `predev` copies draw.io webapp base to `dev/webapp/`. **只需 `pnpm dev` 即可**：`dev/` 已通过 `pnpm make-link` 一次性 `symlink -> <workspace>/data/plugins/siyuan-drawio-plugin`（`scripts/make_dev_link.js` 经 `getSiYuanDir` 或 `SIYUAN_PLUGIN_DIR` 解析），`vite --watch` 增量编译后自动同步到思源测试 workspace，无需手动 `copy` 到 `resources/test`；`dev` 与 `dist` 隔离，`build` 产 `dist/package.zip` 不影响 `dev`。
- `pnpm make-link` — **仅需一次**：将 `dev/` 软链到思源插件目录，后续 `pnpm dev` 自动同步。
- `pnpm build` — production bundle (`vite` + `vite.client.config.ts` both) `prebuild` copies draw.io base, `postbuild` runs `scripts/copy_and_bundle_build.js` to create `package.zip` (no manual IIFE wrapping – client IIFE is handled by Vite).
- `pnpm make-install` combines build + install. Use `pnpm update-version` to bump both `plugin.json` and `package.json`.
- **Siyuan cache**: Electron V8 caches compiled JS. If changes don't reflect, reload the Electron window (Shift+F5 or DevTools reload) instead of restarting SiYuan. Client sourcemap is now correct (Vite IIFE, not manual string wrap).

## Architecture
- **Entry**: `src/index.ts` → `DrawioPlugin` class extends Siyuan `Plugin`.
- **Settings**: `openSetting()` spawns `DrawioSettings` Svelte component. Config typed as `DrawioConfig` in `src/types.ts`, persisted via `saveDrawioConfig()` and Siyuan `loadData`/`saveData`.
- **Dialogs**: Siyuan's `new Dialog({ content })` wraps HTML. When mounting Svelte components, **always use `.b3-dialog__content` as target** — custom ID selectors return null on first render.
- **i18n**: YAML in `public/i18n/` → auto-converted to JSON in `dev/dist/i18n/` by `vitePluginYamlI18n`. Siyuan loads by locale. No `set` calls needed — the i18n plugin handles it.
- **Mobile**: `this.isMobile` flag from `getFrontend()` controls UI paths. Dock components and dialogs adapt for mobile viewports.

## Coding Style & Naming Conventions
4-space indentation in `.ts`. Prefer TypeScript interfaces over `any`. ESM only — no CommonJS imports. Vite resolves via `@/` alias → `src/`. Svelte 4 with `@sveltejs/vite-plugin-svelte`.

## Testing Guidelines

> **铁律：E2E 必须先探后固化 — 不允许直接编写 e2e**
> 1. 任何新增/修改 `e2e/` 用例前，**必须先通过 Playwright MCP 或 `playwright-cli` skill 在真实 Siyuan/Electron 环境中探明并验证交互路径**（CDP `http://127.0.0.1:9222`，需 SiYuan 以 `--remote-debugging-port=9222` 启动）。
> 2. 只有在 Playwright 交互已跑通后，才可将路径固化为 `e2e/` 内的可复现脚本（`pnpm e2e`，`vitest` + `playwright`，`e2e/drawio.test.ts`，30s timeout）。
> 3. **禁止直接手写/猜测 e2e 用例**（含选择器、时序、Dialog/Dock 挂载逻辑）而不经过浏览器实测验证；评审时以 Playwright 实测轨迹为依据。

No automated tests beyond E2E. Manual verification in Siyuan: `pnpm dev` → `pnpm make-link` → insert `/drawio`. Test save, upload, rename, "Copy as Image". For E2E automation, use `pnpm e2e` (`vitest` + `playwright` via CDP `http://127.0.0.1:9222`, `e2e/drawio.test.ts`, 30s timeout; requires SiYuan started with `--remote-debugging-port=9222`).

## Release Process (发布流程) — Tag 驱动自动打包
当用户说“发布”/“发版”/“publish release”时，自动执行以下完整流程，无需再询问是否要发布：

1. **确定版本号与更新日志**：运行 `pnpm run update-version`（即 `node scripts/update_version.js`）。该脚本会：
   - 读取 `plugin.json`/`package.json` 当前 `version`（如 `1.0.40`）
   - 提供选项 1=patch / 2=minor / 3=major / 4=手动输入，更新 `plugin.json` + `package.json` 的 `version`
   - 同步更新 `README.md` 的 `## Version` 与 `README_zh_CN.md` 的 `## 版本` 下的版本号
   - **必须同步更新 Changelog**：在 `README.md:## Changelog` 与 `README_zh_CN.md:## 更新日志` 顶部插入新版本条目（如 `- **vX.Y.Z**` + 变更要点），`scripts/update_version.js` 当前不会自动写 Changelog，需 agent 手动追加
   - 执行 `git add plugin.json package.json README.md README_zh_CN.md && git commit -m "chore: bump version to X.Y.Z" && git push`
   - 执行 `git tag vX.Y.Z && git push origin vX.Y.Z`
   - 若需非交互式发布（agent 自动发布），直接改文件：`plugin.json:5`、`package.json:3`、`README.md:## Version`/`## Changelog`、`README_zh_CN.md:## 版本`/`## 更新日志` 同步改同一版本并追加日志，然后 `git add && git commit && git push && git tag vX.Y.Z && git push origin vX.Y.Z`

2. **CI 自动打包发布**：`git push` 推送 `v*` 标签会触发 `.github/workflows/release.yml:3`（`on: push tags: v*`）。CI 步骤：`actions/checkout@v3`（`with: submodules: recursive`）→ `setup-node@20` → `pnpm/action-setup@v4` → `pnpm install --no-frozen-lockfile` → `npm run build`（即 `vite build` + `scripts/copy_and_bundle_build.js` 生成 `package.zip`）→ `ncipollo/release-action@v1`（`artifacts: "package.zip"`，`allowUpdates: true`）自动创建/更新 GitHub Release。`package.zip` 无需本地提交（已在 `.gitignore:5`），集市索引数小时内自动同步。

3. **Agent 自动化约定**：收到“发布”指令时，默认选 `patch` 自增（除非用户指定 minor/major/具体版本），直接执行上述改版→提交→打 tag→push 全链路，完成后汇报新 tag 与 Release 链接。

## Commit & Pull Request Guidelines
Conventional Commits (`feat(scope):`, `fix(client):`, `chore:`). PRs: user-facing impact, Siyuan versions tested, screenshots for UI changes. Generated bundles stay `.gitignore`'d.

## Security & Configuration
Personal Siyuan paths stay out of commits; `SIYUAN_PLUGIN_DIR` env for local overrides. When bumping Draw.io upstream in `drawio/`, review licenses for marketplace compatibility.
