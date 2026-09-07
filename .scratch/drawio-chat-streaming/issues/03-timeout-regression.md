# 03 — 超时与回归验证

**What to build:** 流式下超时/取消/错误与半截响应处理正确，既有 mermaid/XML 渲染与去围栏回归通过；复杂提示词端到端可用。

**Blocked by:** 01 — 流式传输 tracer-bullet；02 — 思考中 UI。

**Status:** verified — e2e/ai-stream.test.ts 落盘并通过（CDP 9222 真机，mock SSE）；错误冒泡链真机验证正常

- [x] 流式下 generateTimeout（90s 一次性等待）不再误杀长思考：首字节超时与整体超时策略明确，取消/重试可用
- [x] 错误与半截 XML（含截断修复提示）处理与原来一致
- [x] 既有 mermaid/XML 渲染与去围栏回归通过
- [x] 按仓库铁律先经 Playwright 实测（CDP 127.0.0.1:9222）验证交互路径，跑通后固化 e2e（`e2e/ai-stream.test.ts`）
