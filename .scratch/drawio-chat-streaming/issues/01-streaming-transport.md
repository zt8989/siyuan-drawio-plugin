# 01 — 流式传输 tracer-bullet

**What to build:** drawio 聊天走 SSE 流式而非一次性等待：复杂提示词（如“画一个 DeepSeek 的鲸鱼”）不再因等待完整返回而超时，文字逐步出现；兼容 reasoning_content/thinking 增量字段，保留现有非流式兜底与去 ``` 围栏逻辑。

**Blocked by:** None — can start immediately.

**Status:** verified — Playwright 实测通过（真机 DeepSeek 鲸鱼 ~2.5min 无超时；mock SSE e2e 断言 stream:true）

- [x] gpt 配置路径请求带 stream:true，用 fetch/SSE 逐 delta 拼接 content
- [x] 解析 reasoning_content/thinking 增量并向上传递（供 02 显示），无思考字段时行为不变
- [x] 非流式降级可用（服务端不支持 stream 时走原 mxXmlRequest 路径）
- [x] 去围栏（```mermaid/```）逻辑在流式拼接结果上仍然生效
- [x] 复杂提示词（DeepSeek 鲸鱼）在真实思源环境手动验证不再超时、文字逐步出现
