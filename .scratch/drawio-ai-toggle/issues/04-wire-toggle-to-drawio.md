# 04: 开关驱动 draw.io AI 启用/禁用（端到端）

**What to build:** 让设置中的启用开关真正控制 draw.io 的 AI 功能是否出现。开启时将 SiYuan provider 透传为 draw.io 的 ai 配置并展示 Generate 入口；关闭时彻底隐藏 AI 入口，无需用户在 draw.io 内再操作。

**Blocked by:** 02: SiyuanAiProvider 深模块（只读透传）, 03: 设置页 AI 启用/关闭开关

**Status:** ready-for-agent

- [ ] PreConfig 注入改为读取 DrawioConfig.aiEnabled 与 SiyuanAiProvider：aiEnabled=false 时设置 enableAi=false 且 aiActions=[]，AI 入口（toolbar sparkle、Arrange > Insert > Generate、搜索 Generate、模板 Generate）均隐藏
- [ ] aiEnabled=true 且有 SiYuan provider 时，注入 gptApiKey/geminiApiKey/claudeApiKey 与 aiGlobals/aiModels/aiConfigs，Generate 对话框模型下拉可用
- [ ] aiEnabled=true 但无 SiYuan provider 时，仅保留 Clipboard backend，Generate 仍可见但走复制/粘贴响应流程
- [ ] 新建 tab、通过路径打开 tab、Dialog 模式（mobile/min）均按最新开关状态生效，无需重启思源
