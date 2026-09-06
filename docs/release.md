# Release Process — Tag 驱动自动打包

> 从 `AGENTS.md` 迁移。

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
