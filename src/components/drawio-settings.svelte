<script lang="ts">
    import type DrawioPlugin from "@/index";
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";
    import type { Dialog } from "siyuan";

    const SAVE_PATH_KEY = "defaultSavePath";
    const AI_ENABLED_KEY = "aiEnabled";

    export let plugin: DrawioPlugin;
    export let dialog: Dialog | null = null;

    let pendingSavePath: string = "storage/petal/siyuan-drawio-plugin/";
    let pendingAiEnabled: boolean = true;
    let hasChanged = false;

    const syncChanged = () => {
        const cfg = plugin.getDrawioConfig();
        const curPath = cfg?.defaultSavePath || "storage/petal/siyuan-drawio-plugin/";
        const curAi = cfg?.aiEnabled ?? true;
        hasChanged = pendingSavePath !== curPath || pendingAiEnabled !== curAi;
    };

    const resetPending = () => {
        const cfg = plugin.getDrawioConfig();
        pendingSavePath = cfg?.defaultSavePath || "storage/petal/siyuan-drawio-plugin/";
        pendingAiEnabled = cfg?.aiEnabled ?? true;
        hasChanged = false;
    };

    onMount(() => {
        resetPending();
    });

    const handleSave = async () => {
        const cfg = (plugin.getDrawioConfig() ?? {}) as Record<string, unknown>;
        cfg.defaultSavePath = pendingSavePath;
        cfg.aiEnabled = pendingAiEnabled;
        try {
            await plugin.saveDrawioConfig(cfg as unknown as import("@/types").DrawioConfig);
            showMessage(plugin.i18n?.save || "保存成功", 2000, "info");
            dialog?.destroy();
        } catch (error: unknown) {
            console.error("保存设置失败", error);
            showMessage((error as Error)?.message ?? "保存设置失败", 6000, "error");
        }
    };

    const handleCancel = () => {
        dialog?.destroy();
    };

    $: saveGroupTitle = (plugin?.i18n as unknown as Record<string, string>)?.saveGroup || "保存设置";
    $: aiGroupTitle = (plugin?.i18n as unknown as Record<string, string>)?.aiGroup || "AI 设置";
    $: cancelText = (plugin?.i18n as unknown as Record<string, string>)?.cancel || "取消";
    $: saveText = (plugin?.i18n as unknown as Record<string, string>)?.save || "保存";
    $: saveDesc = "新建 Draw.io 文件时的默认保存路径";
    $: aiDesc = (plugin?.i18n as unknown as Record<string, string>)?.aiEnableDesc || "开启后可在 Draw.io 中使用 Generate（AI 生成图表）功能，模型选择由 Draw.io 原生下拉提供，密钥复用思源的 AI 配置";
</script>

<div class="fn__flex-1" style="display:flex;flex-direction:column;height:100%;overflow:hidden;">
    <div style="flex:1;overflow:auto;padding:16px 24px;">
        <!-- 保存设置: 单行, 左标题右控件, 与嵌入式系列一致 -->
        <div class="fn__flex b3-label config__item">
            <div class="fn__flex-1">
                默认保存位置
                <div class="b3-label__text">{saveDesc}</div>
            </div>
            <span class="fn__space"></span>
            <select
                class="b3-select fn__flex-center fn__size200"
                bind:value={pendingSavePath}
                on:change={syncChanged}
            >
                <option value="storage/petal/siyuan-drawio-plugin/">Petal 目录 (storage/petal/siyuan-drawio-plugin/)</option>
                <option value="assets/drawio/">Assets 目录 (assets/drawio/)</option>
            </select>
        </div>
        <div class="fn__hr"></div>
        <div class="fn__flex b3-label config__item">
            <div class="fn__flex-1">
                启用 AI 生成
                <div class="b3-label__text">{aiDesc}</div>
            </div>
            <span class="fn__space"></span>
            <input
                type="checkbox"
                class="b3-switch fn__flex-center"
                bind:checked={pendingAiEnabled}
                on:change={syncChanged}
            />
        </div>
    </div>
    <div class="b3-dialog__action">
        <button class="b3-button b3-button--cancel" data-type="cancel" on:click={handleCancel}>{cancelText}</button>
        <div class="fn__space"></div>
        <button class="b3-button b3-button--text" data-type="confirm" on:click={handleSave} disabled={!hasChanged}>{saveText}</button>
    </div>
</div>

<style>
    .config__item {
        padding: 12px 0;
    }
    .fn__hr {
        height: 1px;
        background-color: var(--b3-border-color);
        border: none;
        margin: 0;
    }
</style>
