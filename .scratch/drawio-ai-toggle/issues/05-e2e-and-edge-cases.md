# 05: E2E 与边界（先探后固化）

**What to build:** 在真实 SiYuan/Electron 环境中验证开关对 AI 功能的端到端控制，并固化可复现的 e2e 用例，覆盖边界与降级路径。

**Blocked by:** 04: 开关驱动 draw.io AI 启用/禁用（端到端）

**Status:** ready-for-agent

- [ ] 按 AGENTS.md 铁律，先通过 Playwright CDP（127.0.0.1:9222）在真实环境探明 Generate 入口显隐、模型下拉、Clipboard 粘贴响应等路径，再固化到 e2e/drawio.test.ts（vitest+playwright，30s 超时）
- [ ] 覆盖：开关开→Generate 可见且可用；开关关→入口完全隐藏；无 SiYuan AI 配置→仅 Clipboard 可用；有配置→对应模型出现在下拉
- [ ] 校验 desktop 与 mobile（Dialog min 模式）表现一致，无 Electron 缓存导致的旧开关状态残留（提示 Shift+F5 刷新）
- [ ] e2e 在 pnpm e2e 下稳定通过，失败时输出可用诊断信息
