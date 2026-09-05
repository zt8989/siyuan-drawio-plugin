# Repository Guidelines

## Project Structure & Module Organization
`src/` hosts the TypeScript + Svelte runtime. Key helpers: `src/link.ts` (URL generation), `src/asset/renderAssets.ts` (iframe HTML), `src/api.ts` (Siyuan API calls). Draw.io upstream assets and bridge scripts live in `drawio/` and `client/` (`PostConfig.js`, `PreConfig.js`, `embed.html`, `embed2.js`). Public files for Vite in `public/`. Build artifacts in `dev/` (hot reload) and `dist/` (production). Symlink utilities in `scripts/`. Plugin config stored at `.opencode/skill/` for embedded skills.

## Build, Test, and Development Commands
- `pnpm dev` — watch build with inline sourcemaps. **Client files (`client/*.js`) auto-copy into `dev/webapp/` on each rebuild** (IIFE-wrapped via `auto-copy-client` plugin in `vite.config.ts`).
- `pnpm make-link` — symlink `dev/` into Siyuan plugin dir for instant preview.
- `pnpm build` — production bundle. `postbuild` runs `scripts/copy_and_bundle_build.js` to create `package.zip`.
- `pnpm make-install` combines build + install. Use `pnpm update-version` to bump both `plugin.json` and `package.json`.
- **Siyuan cache**: Electron V8 caches compiled JS. If changes don't reflect, reload the Electron window (Shift+F5 or DevTools reload) instead of restarting SiYuan.

## Architecture
- **Entry**: `src/index.ts` → `DrawioPlugin` class extends Siyuan `Plugin`.
- **Settings**: `openSetting()` spawns `DrawioSettings` Svelte component. Config typed as `DrawioConfig` in `src/types.ts`, persisted via `saveDrawioConfig()` and Siyuan `loadData`/`saveData`.
- **Dialogs**: Siyuan's `new Dialog({ content })` wraps HTML. When mounting Svelte components, **always use `.b3-dialog__content` as target** — custom ID selectors return null on first render.
- **i18n**: YAML in `public/i18n/` → auto-converted to JSON in `dev/dist/i18n/` by `vitePluginYamlI18n`. Siyuan loads by locale. No `set` calls needed — the i18n plugin handles it.
- **Mobile**: `this.isMobile` flag from `getFrontend()` controls UI paths. Dock components and dialogs adapt for mobile viewports.

## Coding Style & Naming Conventions
4-space indentation in `.ts`. Prefer TypeScript interfaces over `any`. ESM only — no CommonJS imports. Vite resolves via `@/` alias → `src/`. Svelte 4 with `@sveltejs/vite-plugin-svelte`.

## Testing Guidelines
No automated tests. Manual verification in Siyuan: `pnpm dev` → `pnpm make-link` → insert `/drawio`. Test save, upload, rename, "Copy as Image". For debugging Electron apps, use [electron-cdp-debug skill](.opencode/skill/electron-cdp-debug/SKILL.md) (CDP protocol inspection, error capture, E2E UI testing).

## Release Process (发布流程) — Tag 驱动自动打包
当用户说“发布”/“发版”/“publish release”时，自动执行以下完整流程，无需再询问是否要发布：

1. **确定版本号**：运行 `pnpm run update-version`（即 `node scripts/update_version.js`）。该脚本会：
   - 读取 `plugin.json`/`package.json` 当前 `version`（如 `1.0.40`）
   - 提供选项 1=patch / 2=minor / 3=major / 4=手动输入，更新 `plugin.json` + `package.json` 的 `version`
   - 同步更新 `README.md` 的 `## Version` 与 `README_zh_CN.md` 的 `## 版本` 下的版本号
   - 执行 `git add plugin.json package.json README.md README_zh_CN.md && git commit -m "chore: bump version to X.Y.Z" && git push`
   - 执行 `git tag vX.Y.Z && git push origin vX.Y.Z`
   - 若需非交互式发布（agent 自动发布），直接改文件：`plugin.json:5`、`package.json:3`、`README.md:## Version`、`README_zh_CN.md:## 版本` 同步改同一版本，然后 `git add && git commit && git push && git tag vX.Y.Z && git push origin vX.Y.Z`

2. **CI 自动打包发布**：`git push` 推送 `v*` 标签会触发 `.github/workflows/release.yml:3`（`on: push tags: v*`）。CI 步骤：`actions/checkout@v3`（`with: submodules: recursive`）→ `setup-node@20` → `pnpm/action-setup@v4` → `pnpm install --no-frozen-lockfile` → `npm run build`（即 `vite build` + `scripts/copy_and_bundle_build.js` 生成 `package.zip`）→ `ncipollo/release-action@v1`（`artifacts: "package.zip"`，`allowUpdates: true`）自动创建/更新 GitHub Release。`package.zip` 无需本地提交（已在 `.gitignore:5`），集市索引数小时内自动同步。

3. **Agent 自动化约定**：收到“发布”指令时，默认选 `patch` 自增（除非用户指定 minor/major/具体版本），直接执行上述改版→提交→打 tag→push 全链路，完成后汇报新 tag 与 Release 链接。

## Commit & Pull Request Guidelines
Conventional Commits (`feat(scope):`, `fix(client):`, `chore:`). PRs: user-facing impact, Siyuan versions tested, screenshots for UI changes. Generated bundles stay `.gitignore`'d.

## Security & Configuration
Personal Siyuan paths stay out of commits; `SIYUAN_PLUGIN_DIR` env for local overrides. When bumping Draw.io upstream in `drawio/`, review licenses for marketplace compatibility.
