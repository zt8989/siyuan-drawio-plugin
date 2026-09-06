# 03: 设置页 AI 启用/关闭开关

**What to build:** 在插件设置页新增 AI 设置分组，提供单一启用/关闭开关，复用 plugin-sample 的 SettingPanel 模式并持久化到 DrawioConfig。用户在此开关即可控制 draw.io AI 功能是否出现，无需在插件内选模型（模型选择由 draw.io 原生下拉完成）。

**Blocked by:** 01: 探明双端契约并升级 draw.io 至 AI 可用版本

**Status:** ready-for-agent

- [ ] 在 drawio-settings.svelte 新增 AI 分组，含单个 checkbox（enableAi），复用 SettingPanel/Form 模式
- [ ] DrawioConfig 扩展 aiEnabled?: boolean（expand 阶段，缺省视为 true 保持兼容），通过 loadData/saveData 与 localStorage 同步
- [ ] 提供 en_US/zh_CN 文案（启用 AI 生成 / Enable AI Generation）及缺 SiYuan provider 时的提示
- [ ] 开关状态在设置对话框重开后正确回显，且受 isMobile 影响的布局正常
