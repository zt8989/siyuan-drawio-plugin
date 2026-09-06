# 02: SiyuanAiProvider 深模块（只读透传）

**What to build:** 提供一个深模块负责只读获取 SiYuan 的 AI provider 配置，并翻译为 draw.io 的 aiGlobals/aiModels/aiConfigs 形态，供 PreConfig 注入使用。无配置或无权限时返回空，调用方据此走 Clipboard 兜底；提供内存 Fake 实现便于单测。

**Blocked by:** 01: 探明双端契约并升级 draw.io 至 AI 可用版本

**Status:** ready-for-agent

- [ ] 实现 SiyuanAiProvider，封装 fetchSyncPost('/api/setting/getAI') 与 window.siyuan.config.ai 兜底，隐藏接口细节
- [ ] 提供 getAiConfigForDrawio() 返回 draw.io 可用的 aiGlobals/aiConfigs/aiModels（含占位符替换与 endpoint/headers/request/responsePath），缺 key 时返回 null
- [ ] 提供 FakeSiyuanAiProvider 用于单元测试，覆盖有配置/无配置/多 provider 场景
- [ ] 单测验证占位符 {apiKey}/{model}/{prompt}/{action}/{data} 的替换与 responsePath 提取逻辑
