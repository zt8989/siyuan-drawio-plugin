<script lang="ts">
    import SettingPanel from "@/libs/components/setting-panel.svelte";
    import type DrawioPlugin from "@/index";
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";

    const SAVE_PATH_KEY = "defaultSavePath";
    const AI_ENABLED_KEY = "aiEnabled";

    export let plugin: DrawioPlugin;

    let saveItems: ISettingItem[] = [
        {
            type: "select",
            title: "默认保存位置",
            description: "新建 Draw.io 文件时的默认保存路径",
            key: SAVE_PATH_KEY,
            value: "storage/petal/siyuan-drawio-plugin/",
            direction: "row",
            options: {
                "storage/petal/siyuan-drawio-plugin/": "Petal 目录 (storage/petal/siyuan-drawio-plugin/)",
                "assets/drawio/": "Assets 目录 (assets/drawio/)",
            },
        } as ISettingItem,
    ];

    let aiItems: ISettingItem[] = [
        {
            type: "checkbox",
            title: (plugin?.i18n as unknown as Record<string, string>)?.aiEnableTitle || "启用 AI 生成",
            description: (plugin?.i18n as unknown as Record<string, string>)?.aiEnableDesc || "开启后可在 Draw.io 中使用 Generate（AI 生成图表）功能，模型选择由 Draw.io 原生下拉提供，密钥复用思源的 AI 配置",
            key: AI_ENABLED_KEY,
            value: true,
            direction: "row",
        } as ISettingItem,
    ];

    $: {
        const i18n = plugin?.i18n as unknown as Record<string, string>;
        if (i18n?.aiEnableTitle) {
            aiItems = aiItems.map((it) => it.key === AI_ENABLED_KEY ? { ...it, title: i18n.aiEnableTitle, description: i18n.aiEnableDesc } : it);
        }
        if (i18n?.saveGroup) {
            // keep titles in sync if needed
        }
    }

    const resetValue = () => {
        const cfg = plugin.getDrawioConfig();
        const defaultSavePath = cfg?.defaultSavePath || "storage/petal/siyuan-drawio-plugin/";
        const aiEnabled = cfg?.aiEnabled ?? true;
        saveItems = saveItems.map((item) => item.key === SAVE_PATH_KEY ? { ...item, value: defaultSavePath } : item);
        aiItems = aiItems.map((item) => item.key === AI_ENABLED_KEY ? { ...item, value: aiEnabled } : item);
    };

    onMount(() => {
        resetValue();
    });

    const onSaveChanged = async ({ detail }: CustomEvent<{ group: string; key: string; value: any }>) => {
        saveItems = saveItems.map((item) => item.key === detail.key ? { ...item, value: detail.value } : item);
        const cfg = (plugin.getDrawioConfig() ?? {}) as Record<string, unknown>;
        if (detail.key === SAVE_PATH_KEY) cfg.defaultSavePath = detail.value;
        try {
            await plugin.saveDrawioConfig(cfg as unknown as import("@/types").DrawioConfig);
        } catch (error: unknown) {
            console.error("保存设置失败", error);
            showMessage((error as Error)?.message ?? "保存设置失败", 6000, "error");
        }
    };

    const onAiChanged = async ({ detail }: CustomEvent<{ group: string; key: string; value: any }>) => {
        aiItems = aiItems.map((item) => item.key === detail.key ? { ...item, value: detail.value } : item);
        const cfg = (plugin.getDrawioConfig() ?? {}) as Record<string, unknown>;
        if (detail.key === AI_ENABLED_KEY) cfg.aiEnabled = detail.value;
        try {
            await plugin.saveDrawioConfig(cfg as unknown as import("@/types").DrawioConfig);
        } catch (error: unknown) {
            console.error("保存设置失败", error);
            showMessage((error as Error)?.message ?? "保存设置失败", 6000, "error");
        }
    };

    $: saveGroupTitle = (plugin?.i18n as unknown as Record<string, string>)?.saveGroup || "保存设置";
    $: aiGroupTitle = (plugin?.i18n as unknown as Record<string, string>)?.aiGroup || "AI 设置";
</script>

<div class="fn__flex-1 config__panel">
    <div class="config__section">
        <div class="b3-label"><span class="b3-label__text">{saveGroupTitle}</span></div>
        <SettingPanel
            group={saveGroupTitle}
            settingItems={saveItems}
            on:changed={onSaveChanged}
        >
            <div class="fn__flex b3-label">设置 Draw.io 新建文件时的默认保存路径。</div>
        </SettingPanel>
    </div>
    <div class="config__section">
        <div class="b3-label"><span class="b3-label__text">{aiGroupTitle}</span></div>
        <SettingPanel
            group={aiGroupTitle}
            settingItems={aiItems}
            on:changed={onAiChanged}
        >
            <div class="fn__flex b3-label">控制 Draw.io 的 AI 生成（Generate）功能是否启用。启用时复用思源的 AI 密钥，模型由 Draw.io 侧选择。</div>
        </SettingPanel>
    </div>
</div>

<style>
    .config__panel {
        height: 100%;
        overflow-y: auto;
        padding: 16px 24px;
    }
    .config__section + .config__section {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--b3-border-color);
    }
</style>
