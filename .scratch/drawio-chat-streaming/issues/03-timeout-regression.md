# 03 — 超时与回归验证

**What to build:** 流式下超时/取消/错误与半截响应处理正确，既有 mermaid/XML 渲染与去围栏回归通过；复杂提示词端到端可用。

**Blocked by:** 01 — 流式传输 tracer-bullet；02 — 思考中 UI。

**Status:** ready-for-agent

- [ ] 流式下 generateTimeout（90s 一次性等待）不再误杀长思考：首字节超时与整体超时策略明确，取消/重试可用
- [ ] 错误与半截 XML（含截断修复提示）处理与原来一致
- [ ] 既有 mermaid/XML 渲染与去围栏回归通过
- [ ] 按仓库铁律先经 Playwright 实测（CDP 127.0.0.1:9222，思源以 --remote-debugging-port=9222 启动）验证交互路径，跑通后才固化 e2e（禁止直接手写 e2e）
