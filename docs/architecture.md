# Architecture

> 从 `AGENTS.md` 迁移，补充 `CONTEXT.md` 域词汇。

## Project Structure & Module Organization

`src/` hosts the TypeScript + Svelte runtime. Key helpers: `src/link.ts` (URL generation), `src/asset/renderAssets.ts` (iframe HTML), `src/api.ts` (Siyuan API calls). Draw.io upstream assets and bridge scripts live in `drawio/` and `client/` (`PostConfig.js`, `PreConfig.js`, `embed.html`, `embed2.js`). Public files for Vite in `public/`. Build configs: `vite.config.ts` for `src/` → `dev/index.js`/`dist/index.js`, `vite.client.config.ts` for `client/` → `dev/webapp/js/`/`dist/webapp/js/` as IIFE with inline sourcemap (separated to keep sourcemap alignment). Build artifacts in `dev/` (hot reload) and `dist/` (production). Symlink utilities in `scripts/`.

## Architecture

- **Entry**: `src/index.ts` → `DrawioPlugin` class extends Siyuan `Plugin`.
- **Settings**: `openSetting()` spawns `DrawioSettings` Svelte component. Config typed as `DrawioConfig` in `src/types.ts`, persisted via `saveDrawioConfig()` and Siyuan `loadData`/`saveData`.
- **Dialogs**: Siyuan's `new Dialog({ content })` wraps HTML. When mounting Svelte components, **always use `.b3-dialog__content` as target** — custom ID selectors return null on first render.
- **i18n**: YAML in `public/i18n/` → auto-converted to JSON in `dev/dist/i18n/` by `vitePluginYamlI18n`. Siyuan loads by locale. No `set` calls needed — the i18n plugin handles it.
- **Mobile**: `this.isMobile` flag from `getFrontend()` controls UI paths. Dock components and dialogs adapt for mobile viewports.

详见 `CONTEXT.md` 的域模型：`Asset` / `DrawioAsset` / `AssetStore` / `DrawioBridge` / `WebappPublisher`。
