# 01: 探明双端契约并升级 draw.io 至 AI 可用版本

**What to build:** 让 draw.io 的 Generate（AI）能力在插件内可用，并明确 SiYuan 侧 provider 的真实契约。升级 drawio 子模块到包含 enableAi/aiGlobals/aiModels/aiConfigs/responsePath 的版本，验证 dev/webapp 与 dist/webapp 中 Generate 入口（sparkle 按钮、Arrange > Insert > Generate、搜索 Generate）在 enableAi=true 时出现；同时探明 SiYuan AI 配置的真实读取方式（/api/setting/getAI、/api/system/getConf、window.siyuan.config.ai 等）及返回体（Provider、OpenAI.APIKey/APIModel/APIBaseURL 等），产出映射决策记录（ADR/笔记）说明如何由 SiYuan provider 透传为 gptApiKey/geminiApiKey/claudeApiKey 与 aiConfigs，缺 key 时走 Clipboard 兜底的策略。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] drawio 子模块已升级到 AI 配置可用的版本，predev/prebuild 拷贝后的 webapp 含 ai 相关配置键
- [ ] 本地验证 enableAi=true 时 Generate 入口可见，enableAi=false 或 aiActions=[] 时入口隐藏
- [ ] 探明并记录 SiYuan AI 配置的真实接口与返回体（含 Provider 枚举、OpenAI 字段、是否多模型），附调用示例
- [ ] 产出 ADR/笔记明确透传策略与无配置时的 Clipboard 降级
