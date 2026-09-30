# 01 — 模板生成对话框改道自带模型

**What to build:** 新建绘图模板里的“生成”按钮不再打 `https://www.draw.io/generate/v3`（必 Unauthorized），而是走思源 provider 的 `chat/completions` endpoint；输入描述点确定后正常出图，大提示词不超时（自动继承 SSE 流式）。

**Blocked by:** None — can start immediately.

**Status:** verified — 真机探路 + `pnpm e2e e2e/ai-generate.test.ts` 通过

- [x] 有 key 时改道自带 endpoint，无 key 时保留上游原行为
- [x] 请求体与聊天窗 model 路径一致（model + create 指令 + prompt）
- [x] 大提示词不触发 90s 超时（走流式合成路径）
- [x] 真机验证不再出现 Unauthorized
