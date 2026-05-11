<script lang="ts">
    import SettingPanel from "@/libs/components/setting-panel.svelte";
    import type DrawioPlugin from "@/index";
    import { onMount } from "svelte";
    import { showMessage } from "siyuan";

    const SAVE_GROUP = "保存设置";
    const SAVE_PATH_KEY = "defaultSavePath";

    export let plugin: DrawioPlugin;

    let groups = [SAVE_GROUP];
    let focusGroup = groups[0];

    let settingItems: ISettingItem[] = [
        {
            type: "select",
            title: "默认保存位置",
            description: "新建 Draw.io 文件时的默认保存路径",
            key: SAVE_PATH_KEY,
            value: "storage/petal/siyuan-drawio-plugin/",
            group: SAVE_GROUP,
            direction: "row",
            options: {
                "storage/petal/siyuan-drawio-plugin/": "Petal 目录 (storage/petal/siyuan-drawio-plugin/)",
                "assets/drawio/": "Assets 目录 (assets/drawio/)",
            },
        },
    ];

    const resetValue = () => {
        const defaultSavePath = plugin.getDrawioConfig()?.defaultSavePath || "storage/petal/siyuan-drawio-plugin/";
        settingItems = settingItems.map((item) => {
            if (item.key === SAVE_PATH_KEY) {
                return { ...item, value: defaultSavePath };
            }
            return item;
        });
    };

    onMount(() => {
        resetValue();
    });

    const onChanged = async ({ detail }: CustomEvent<{ group: string; key: string; value: any }>) => {
        settingItems = settingItems.map((item) =>
            item.key === detail.key ? { ...item, value: detail.value } : item
        );

        const config = { ...plugin.getDrawioConfig() };

        if (detail.key === SAVE_PATH_KEY) {
            config.defaultSavePath = detail.value;
        }

        try {
            await plugin.saveDrawioConfig(config);
        } catch (error) {
            console.error("保存设置失败", error);
            showMessage(error?.message ?? "保存设置失败", 6000, "error");
        }
    };
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <li
                class="b3-list-item"
                class:b3-list-item--focus={group === focusGroup}
                on:click={() => (focusGroup = group)}
            >
                <span class="b3-list-item__text">{group}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        <SettingPanel
            group={SAVE_GROUP}
            settingItems={settingItems}
            display={focusGroup === SAVE_GROUP}
            on:changed={onChanged}
        >
            <div class="fn__flex b3-label">设置 Draw.io 新建文件时的默认保存路径。</div>
        </SettingPanel>
    </div>
</div>

<style>
    .config__panel {
        height: 100%;
    }

    .config__panel > ul > li {
        padding-left: 1rem;
    }
</style>
