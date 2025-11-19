# Repository Guidelines

## Project Structure & Module Organization
`src/` hosts the TypeScript + Svelte runtime that injects Draw.io into Siyuan; key helpers such as `src/link.ts` handle URL generation while `src/file.ts` writes diagram assets. Draw.io’s upstream assets and bridge scripts stay in `client/` and `drawio/`, static marketing media in `asset/`, and raw public files for Vite in `public/`. Build artifacts appear in `dev/` (hot reload) and `dist/` (production), with packaging helpers and symlink utilities inside `scripts/`.

## Build, Test, and Development Commands
Run `pnpm install` once, then `pnpm dev` for a watch build with inline source maps. `pnpm make-link` (or `pnpm make-link-win`) symlinks `dev/` into your Siyuan plugin directory for instant preview; `pnpm make-build-link` instead links the optimized `dist/` output. Ship-ready bundles come from `pnpm build`, followed by `pnpm make-install` to populate `package.zip`. Use `pnpm update-version` whenever both `plugin.json` and `package.json` need version bumps.

## Coding Style & Naming Conventions
Honor the prevailing 4-space indentation in `.ts` files and keep Svelte blocks in the `<script>/<style>` order produced by the official formatter. Stick to camelCase for variables and functions, kebab-case filenames, and prefer TypeScript interfaces over `any`. The repo is ESM (`"type": "module"`), so avoid introducing CommonJS imports; rely on Vite’s module resolution and relative paths rooted at `src/`.

## Testing Guidelines
Automated tests are not yet in place, so validate changes manually inside Siyuan. After `pnpm dev` and `pnpm make-link`, open a note, insert `/drawio`, and exercise save, upload, rename, and “Copy as Image” flows across at least one desktop frontend. Capture Siyuan console logs plus the affected asset path (`storage/petal/siyuan-drawio-plugin/<file>.drawio`) when filing or fixing regressions, and include reproduction steps in PR descriptions.

## Commit & Pull Request Guidelines
Commits follow a light Conventional Commits style (`feat(scope):`, `fix(client):`, `chore:`); keep scopes meaningful and messages under ~72 characters. PRs should explain the user-facing impact, note Siyuan version(s) tested, and attach screenshots or GIFs whenever UI chrome changes (dock bar buttons, command menu labels). Reference issues with `Fixes #ID`, ensure generated bundles stay ignored, and request review once ESLint/Vite warnings are resolved locally.

## Security & Configuration Tips
Keep personal Siyuan paths out of commits; scripts honor `SIYUAN_PLUGIN_DIR` for local overrides. Validate that exported diagrams remain under `storage/petal/siyuan-drawio-plugin/` and do not expose unrelated notebooks. When bumping Draw.io in `drawio/`, review upstream licenses separately so the plugin remains shippable in official marketplaces.
