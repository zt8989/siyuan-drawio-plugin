# Repository Guidelines

## Project Structure & Module Organization
`src/` hosts the TypeScript + Svelte runtime. Key helpers: `src/link.ts` (URL generation), `src/asset/renderAssets.ts` (iframe HTML), `src/api.ts` (Siyuan API calls). Draw.io upstream assets and bridge scripts live in `drawio/` and `client/` (`PostConfig.js`, `PreConfig.js`, `embed.html`, `embed2.js`). Public files for Vite in `public/`. Build configs: `vite.config.ts` for `src/` → `dev/index.js`/`dist/index.js`, `vite.client.config.ts` for `client/` → `dev/webapp/js/`/`dist/webapp/js/` as IIFE with inline sourcemap (separated to keep sourcemap alignment). Build artifacts in `dev/` (hot reload) and `dist/` (production). Symlink utilities in `scripts/`.

## Build, Test, and Development Commands
- `pnpm dev` — watch build with inline sourcemaps via `concurrently` (`vite.config.ts` for src + `vite.client.config.ts` for client `PreConfig`/`PostConfig` as IIFE to `dev/webapp/js/`). `predev` copies draw.io webapp base to `dev/webapp/`.
- `pnpm make-link` — symlink `dev/` into Siyuan plugin dir for instant preview.
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
No automated tests. Manual verification in Siyuan: `pnpm dev` → `pnpm make-link` → insert `/drawio`. Test save, upload, rename, "Copy as Image". For E2E automation, use `pnpm e2e` (`vitest` + `playwright` via CDP `http://127.0.0.1:9222`, `e2e/drawio.test.ts`, 30s timeout; requires SiYuan started with `--remote-debugging-port=9222`).

## Commit & Pull Request Guidelines
Conventional Commits (`feat(scope):`, `fix(client):`, `chore:`). PRs: user-facing impact, Siyuan versions tested, screenshots for UI changes. Generated bundles stay `.gitignore`'d.

## Security & Configuration
Personal Siyuan paths stay out of commits; `SIYUAN_PLUGIN_DIR` env for local overrides. When bumping Draw.io upstream in `drawio/`, review licenses for marketplace compatibility.
