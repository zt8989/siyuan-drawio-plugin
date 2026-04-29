<script lang="ts">
    import { createEventDispatcher } from "svelte";

    export let group: string;
    export let settingItems: ISettingItem[] = [];
    export let display: boolean = true;

    const dispatch = createEventDispatcher();

    const onChange = (key: string, value: any) => {
        dispatch("changed", { group, key, value });
    };

    const getInputType = (type: TSettingItemType): string => {
        switch (type) {
            case "textinput":
                return "text";
            case "number":
                return "number";
            default:
                return "text";
        }
    };
</script>

{#if display}
    <div class="config__tab-container">
        <slot />
        {#each settingItems as item}
            <div
                class="b3-form__space"
                class:fn__flex={item.direction === "row"}
                class:fn__flex-column={item.direction !== "row"}
            >
                <div class="fn__flex-1">
                    <div class="b3-label__text">{item.title}</div>
                    <div class="b3-label__desc">{item.description}</div>
                </div>
                <div class="fn__flex-1">
                    {#if item.type === "textarea"}
                        <textarea
                            class="b3-text-field fn__block"
                            placeholder={item.placeholder || ""}
                            value={item.value}
                            on:change={(e) => onChange(item.key, e.currentTarget.value)}
                        />
                    {:else if item.type === "textinput" || item.type === "number"}
                        <input
                            type={getInputType(item.type)}
                            class="b3-text-field fn__block"
                            placeholder={item.placeholder || ""}
                            value={item.value}
                            on:change={(e) => onChange(item.key, e.currentTarget.value)}
                        />
                    {:else if item.type === "checkbox"}
                        <input
                            type="checkbox"
                            class="b3-switch fn__flex-center"
                            checked={item.value}
                            on:change={(e) => onChange(item.key, e.currentTarget.checked)}
                        />
                    {:else if item.type === "select"}
                        <select
                            class="b3-select fn__flex-center fn__size200"
                            value={item.value}
                            on:change={(e) => onChange(item.key, e.currentTarget.value)}
                        >
                            {#if item.options}
                                {#each Object.entries(item.options) as [key, label]}
                                    <option value={key}>{label}</option>
                                {/each}
                            {/if}
                        </select>
                    {:else if item.type === "slider"}
                        <input
                            type="range"
                            class="b3-slider fn__size200"
                            min={item.slider?.min ?? 0}
                            max={item.slider?.max ?? 100}
                            step={item.slider?.step ?? 1}
                            value={item.value}
                            on:change={(e) => onChange(item.key, parseInt(e.currentTarget.value))}
                        />
                    {:else if item.type === "button"}
                        <button
                            class="b3-button b3-button--outline fn__flex-center fn__size200"
                            on:click={() => item.button?.callback?.()}
                        >
                            {item.button?.label || "Button"}
                        </button>
                    {/if}
                </div>
            </div>
        {/each}
    </div>
{/if}

<style>
    .config__tab-container {
        padding: 1rem;
    }

    .b3-form__space {
        margin-bottom: 1rem;
    }

    textarea {
        min-height: 12em;
        resize: vertical;
    }
</style>
