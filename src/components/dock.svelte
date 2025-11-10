<script lang="ts">
    import type DrawioPlugin from '@/index';
    import { confirm, showMessage } from 'siyuan';
    import { onMount } from 'svelte';
    import { removeFile, listDrawioFiles, saveDrawIo } from '@/api';
    import { ICON_STANDARD, DATA_PATH, PLUGIN_CONFIG, drawioAssetsPath } from '@/constants';
    import { addWhiteboard, renameWhiteboard } from '@/dialog';
    import type { Asset } from '@/types';
    import { genDrawioHTMLByUrl } from '@/asset/renderAssets';

    export let plugin: DrawioPlugin;

    let assets: Asset[] = [];
    let isLoading = false;
    let error = '';
    let fileInput: HTMLInputElement;
    let showSortMenu = false;
    let sortMethod = 'nameAsc'; // Default sort method

    // Sort options
    const sortOptions = [
        { id: 'nameAsc', label: 'sortNameAsc' },
        { id: 'nameDesc', label: 'sortNameDesc' },
        { id: 'updateAsc', label: 'sortUpdateAsc' },
        { id: 'updateDesc', label: 'sortUpdateDesc' },
    ];

    // Load saved sort preference
    const loadSortPreference = async () => {
        try {
            const config = await plugin.loadData(PLUGIN_CONFIG);
            if (config && config.sortMethod) {
                sortMethod = config.sortMethod;
            }
        } catch (e) {
            console.error('Failed to load sort preference:', e);
        }
    };

    // Save sort preference
    const saveSortPreference = async (method: string) => {
        try {
            const config = (await plugin.loadData(PLUGIN_CONFIG)) || {};
            config.sortMethod = method;
            await plugin.saveData(PLUGIN_CONFIG, config);
        } catch (e) {
            console.error('Failed to save sort preference:', e);
        }
    };

    const add = () =>
        addWhiteboard(plugin, path => {
            plugin.openCustomTabByPath(path);
            searchAssets();
        });

    const handleUpload = async (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (!target.files || target.files.length === 0) return;

        const files = Array.from(target.files);
        const drawioFiles = files.filter(file => file.name.endsWith('.drawio'));

        if (drawioFiles.length === 0) {
            error = plugin.i18n.uploadDrawioOnly || 'Please upload .drawio files only';
            return;
        }

        isLoading = true;
        error = '';
        try {
            for (const file of drawioFiles) {
                await saveDrawIo(file);
                showMessage(plugin.i18n.uploadSuccess.replace('${fileName}', file.name) || 'Upload successful');
            }
            searchAssets();
        } catch (err) {
            error = err.message;
            showMessage(err.message, 6000, 'error');
        } finally {
            isLoading = false;
            target.value = '';
        }
    };

    const handleOpen = (path: string) => {
        plugin.openCustomTabByPath(path);
    };

    const handleCopy = (path: string, e: MouseEvent) => {
        e.stopPropagation();
        plugin.copyRawLink(genDrawioHTMLByUrl(path));
    };

    const handleCopyPath = (path: string, e: MouseEvent) => {
        e.stopPropagation();
        // 提取文件名和完整路径
        const pathParts = path.split('/');
        const fullFileName = pathParts[pathParts.length - 1];
        
        // 定义常见图片后缀
        const imgExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
        
        // 处理文件名，移除图片后缀
        let fileName = fullFileName;
        for (const ext of imgExtensions) {
            if (fileName.endsWith(ext)) {
                fileName = fileName.substring(0, fileName.length - ext.length);
                break;
            }
        }
        
        // 生成 Markdown 格式的图片链接
        const markdownLink = `![${fileName}](${path})`;
        plugin.copyRawLink(markdownLink);
    };

    const handleEdit = (file: Asset, e: MouseEvent) => {
        e.stopPropagation();
        renameWhiteboard(plugin, file, () => {
            searchAssets();
        });
    };

    const handleDelete = (file: Asset, event) => {
        event.stopPropagation();
        confirm(
            plugin.i18n.deleteWarn + ':' + plugin.i18n.title,
            plugin.i18n.deleteConfirm.replace('${file}', file.hName),
            () => {
                removeFile(DATA_PATH + file.path).then(() => {
                    searchAssets();
                });
            }
        );
    };

    const searchAssets = () => {
        isLoading = true;
        error = '';
        listDrawioFiles()
            .then(data => {
                assets = data;
                sortAssets(); // Sort after loading
                isLoading = false;
            })
            .catch(err => {
                error = err.message;
                isLoading = false;
            });
    };

    const toggleSortMenu = (event: MouseEvent) => {
        event.stopPropagation();
        showSortMenu = !showSortMenu;
        if (showSortMenu) {
            document.addEventListener('click', closeSortMenu);
        }
    };

    const closeSortMenu = () => {
        showSortMenu = false;
        document.removeEventListener('click', closeSortMenu);
    };

    const setSortMethod = (method: string, event: MouseEvent) => {
        event.stopPropagation();
        sortMethod = method;
        saveSortPreference(method);
        sortAssets();
        closeSortMenu();
    };

    const sortAssets = () => {
        switch (sortMethod) {
            case 'nameAsc':
                assets = [...assets].sort((a, b) =>
                    a.hName.localeCompare(b.hName, undefined, {
                        numeric: true,
                        sensitivity: 'base',
                    })
                );
                break;
            case 'nameDesc':
                assets = [...assets].sort((a, b) =>
                    b.hName.localeCompare(a.hName, undefined, {
                        numeric: true,
                        sensitivity: 'base',
                    })
                );
                break;
            case 'updateAsc':
                assets = [...assets].sort((a, b) => a.updated - b.updated);
                break;
            case 'updateDesc':
                assets = [...assets].sort((a, b) => b.updated - a.updated);
                break;
        }
    };

    onMount(async () => {
        await loadSortPreference();
        searchAssets();
        return () => {
            document.removeEventListener('click', closeSortMenu);
        };
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
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label={plugin.i18n.sortFiles}
            on:click={toggleSortMenu}
        >
            <svg><use xlink:href="#iconSort"></use></svg>
        </span>
        {#if showSortMenu}
            <div
                class="b3-menu"
                style="position: absolute; top: 40px; right: 5px; z-index: 200;"
                on:click={e => e.stopPropagation()}
            >
                {#each sortOptions as option}
                    <button class="b3-menu__item" on:click={e => setSortMethod(option.id, e)}>
                        <svg
                            class="b3-menu__icon"
                            style={sortMethod === option.id
                                ? 'visibility: visible'
                                : 'visibility: hidden'}
                        >
                            <use xlink:href="#iconSelect"></use>
                        </svg>
                        <span class="b3-menu__label">{plugin.i18n[option.label]}</span>
                    </button>
                {/each}
            </div>
        {/if}
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
            class="block__icon b3-tooltips b3-tooltips__sw"
            aria-label={plugin.i18n.upload || 'Upload'}
            on:click={() => fileInput.click()}
        >
            <input
                type="file"
                accept=".drawio"
                multiple
                style="display: none"
                bind:this={fileInput}
                on:change={handleUpload}
            />
            <svg>
                <use xlink:href="#iconUpload"></use>
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
                    <div class="b3-list-item align-between" data-name={asset.path}>
                        <div class="b3-list-item__content">
                            <span>
                                <svg><use xlink:href="#{ICON_STANDARD}"></use></svg>
                            </span>
                            <span on:click={() => handleOpen(asset.path)}>{asset.hName}[{asset.ext}]</span>
                        </div>
                        <div class="b3-list-item__operate">
                            <span
                                class="fileicon editfile b3-tooltips b3-tooltips__s"
                                aria-label={plugin.i18n.renameWhiteboard}
                                data-name={asset.path}
                                on:click={e => handleEdit(asset, e)}
                            >
                                <svg>
                                    <use xlink:href="#iconEdit"></use>
                                </svg>
                            </span>
                            <span
                                class="fileicon copyfile b3-tooltips b3-tooltips__s"
                                aria-label={plugin.i18n.copyLink}
                                data-name={asset.path}
                                on:click={e => handleCopy(asset.path, e)}
                            >
                                <svg>
                                    <use xlink:href="#iconCopy"></use>
                                </svg>
                            </span>
                            {#if ['png', 'svg'].includes(asset.ext) && asset.path.includes(drawioAssetsPath)}
                            <span
                                class="fileicon copylink b3-tooltips b3-tooltips__s"
                                aria-label={plugin.i18n.copyLink}
                                data-name={asset.path}
                                on:click={e => handleCopyPath(asset.path, e)}
                            >
                                <svg>
                                    <use xlink:href="#iconLink"></use>
                                </svg>
                            </span>
                            {/if}
                            <span
                                class="fileicon deletefile b3-tooltips b3-tooltips__s"
                                aria-label={plugin.i18n.delete}
                                data-name={asset.path}
                                on:click={e => handleDelete(asset, e)}
                            >
                                <svg>
                                    <use xlink:href="#iconTrashcan"></use>
                                </svg>
                            </span>
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
