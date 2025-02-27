<script lang="ts">
    import type DrawioPlugin from '@/index'
    import { confirm } from "siyuan";
    import { onMount } from 'svelte';
    import { removeFile, listDrawioFiles } from '@/api';
    import {ICON_STANDARD, DATA_PATH} from "@/constants"
    import { addWhiteboard, renameWhiteboard } from '@/dialog';
    import type { Asset } from '@/types';
    import { genDrawioHTMLByUrl } from '@/asset/renderAssets';
    
    export let plugin: DrawioPlugin;

    let assets: Asset[] = [];
    let isLoading = false;
    let error = '';

    const add = () => addWhiteboard(plugin, (path) => {
        plugin.openCustomTabByPath(path);
        searchAssets();    
    })

    const handleOpen = (path: string) => {
        plugin.openCustomTabByPath(path);
    };

    const handleCopy = (path: string, e: MouseEvent) => {
        e.stopPropagation();
        plugin.copyRawLink(genDrawioHTMLByUrl(path));
    };

    const handleEdit = (file: Asset, e: MouseEvent) => {
        e.stopPropagation();
        renameWhiteboard(plugin, file, () => {
            searchAssets();
        })
    };

    const handleDelete = (file: Asset, event) => {
        event.stopPropagation();
        confirm(plugin.i18n.deleteWarn + ":" + plugin.i18n.title, plugin.i18n.deleteConfirm.replace("${file}", file.hName), () => {
            removeFile(DATA_PATH + file.path).then(() => {
                searchAssets();
            });
        })
    };

    const searchAssets = () => {
        isLoading = true;
        error = '';
        listDrawioFiles().then(data => {
            assets = data;
            isLoading = false;
        }).catch(err => {
            error = err.message;
            isLoading = false;
        });
    };

    onMount(() => {
        searchAssets();
    });
</script>

<div class="fn__flex-1 fn__flex-column">
    <div class="block__icons">
        <div class="block__logo">
            <svg class="block__logoicon"><use xlink:href="#{ICON_STANDARD}"></use></svg>
            {plugin.i18n.title}
        </div>
        <span class="fn__flex-1 fn__space"></span>
        <span
            data-type="min"
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label={plugin.i18n.min}
        >
            <svg>
            <use xlink:href="#iconMin"></use>
            </svg>
        </span>
        <span
            id="add-draw"
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label={plugin.i18n.create}
            on:click={() => add()}
        >
            <svg>
            <use xlink:href="#iconAdd"></use>
            </svg>
        </span>
        <span
            id="refresh"
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label={plugin.i18n.refresh}
            on:click={() => searchAssets()}
        >
            <svg>
            <use xlink:href="#iconRefresh"></use>
            </svg>
        </span>
    </div>
    <div class="fn__flex-1 plugin-drawio__custom-dock">
        {#if isLoading}
            <div class="b3-list--empty">Loading...</div>
        {:else if error}
            <div class="b3-list--empty">{error}</div>
        {:else if assets.length === 0}
            <div class="b3-list--empty">No drawio files found</div>
        {:else}
            <div class="b3-list">
                {#each assets as asset}
                    <div class="b3-list-item" data-name={asset.path}>
                        <span on:click={() => handleOpen(asset.path)}>{asset.hName}</span>
                        <span
                            class="fileicon editfile b3-tooltips b3-tooltips__s"
                            aria-label={plugin.i18n.edit}
                            data-name={asset.path}
                            on:click={(e) => handleEdit(asset, e)}
                        >
                            <svg>
                                <use xlink:href="#iconEdit"></use>
                            </svg>
                        </span>
                        <span
                            class="fileicon copyfile b3-tooltips b3-tooltips__s"
                            aria-label={plugin.i18n.copyLink}
                            data-name={asset.path}
                            on:click={(e) => handleCopy(asset.path, e)}
                        >
                            <svg>
                                <use xlink:href="#iconCopy"></use>
                            </svg>
                        </span>
                        <span
                            class="fileicon deletefile b3-tooltips b3-tooltips__s"
                            aria-label={plugin.i18n.delete}
                            data-name={asset.path}
                            on:click={(e) => handleDelete(asset, e)}
                        >
                            <svg>
                                <use xlink:href="#iconTrashcan"></use>
                            </svg>
                        </span>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
