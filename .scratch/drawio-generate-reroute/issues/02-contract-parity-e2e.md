# 02 — 生成契约对齐与回归固化

**What to build:** 改道后的返回分类与上游一致（mxGraphModel 提取、截断修复、XML 原样透传、mermaid 解析+分组包裹、错误带重试），既有聊天流式不受影响。

**Blocked by:** 01 — 模板生成对话框改道自带模型。

**Status:** verified — e2e 落盘通过，聊天流式回归通过

- [x] XML / mermaid / 纯文本三路分类与上游 `generateOpenAiMermaidDiagram` 一致
- [x] 错误带可重试（`e.retry` 按上游契约回填，对话框重试链可用）
- [x] 按铁律先 Playwright 实测再固化 e2e（小而校验过的 XML mock SSE）
- [x] 聊天窗流式回归通过（`pnpm e2e e2e/ai-stream.test.ts`）
