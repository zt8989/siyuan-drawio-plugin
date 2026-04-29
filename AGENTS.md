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

## Commit & Pull Request Guidelines
Conventional Commits (`feat(scope):`, `fix(client):`, `chore:`). PRs: user-facing impact, Siyuan versions tested, screenshots for UI changes. Generated bundles stay `.gitignore`'d.

## Security & Configuration
Personal Siyuan paths stay out of commits; `SIYUAN_PLUGIN_DIR` env for local overrides. When bumping Draw.io upstream in `drawio/`, review licenses for marketplace compatibility.
