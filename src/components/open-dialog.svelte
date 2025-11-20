<script lang="ts">
  import { onMount, tick } from "svelte";
  import { listDrawioFiles, searchDrawioFiles } from "@/api";
  import { upDownHint } from "@/util/upDownHint";
  import type { Dialog } from "siyuan";
  import type { Asset, ShowDialogCallback } from "@/types";

  export let showCreate = false;
  export let callback: ShowDialogCallback | undefined;
  export let dialog: Dialog | undefined;
  export let isMobile = false;
  export let i18n = {
    create: "",
    exitSearch: "",
    emptyContent: "",
  };

  let query = "";
  let loading = true;
  let results: Asset[] = [];
  let inputElement: HTMLInputElement;
  let listElement: HTMLDivElement;
  const position = { x: 500, y: 500 };

  onMount(() => {
    renderList(query);
    if (dialog && inputElement && typeof dialog.bindInput === "function") {
      dialog.bindInput(inputElement);
    }
  });

  const renderList = async (keyword: string) => {
    loading = true;
    try {
      const assets = await listDrawioFiles();
      results = await searchDrawioFiles(keyword, assets);
    } catch (error) {
      console.error("Error rendering asset list:", error);
      results = [];
    } finally {
      loading = false;
      await tick();
      setDefaultFocus();
      showPopup(keyword);
    }
  };

  const setDefaultFocus = () => {
    if (!listElement) {
      return;
    }
    const activeItems = listElement.querySelectorAll(".b3-list-item--focus");
    activeItems.forEach((element) => element.classList.remove("b3-list-item--focus"));
    const firstElement = listElement.querySelector(".b3-list-item") as HTMLElement;
    firstElement?.classList.add("b3-list-item--focus");
  };

  const showPopup = (keyword: string) => {
    if (!listElement || typeof window === "undefined" || !window.siyuan) {
      return;
    }
    if (isMobile) {
      window.siyuan.menus.menu.fullscreen();
    } else {
      window.siyuan.menus.menu.popup(position);
    }
    if (!keyword) {
      inputElement?.select();
    }
  };

  const handleInput = async (event: InputEvent) => {
    if (event.isComposing) {
      return;
    }
    event.stopPropagation();
    const value = (event.target as HTMLInputElement).value;
    query = value;
    await renderList(value);
  };

  const handleCompositionEnd = async (event: CompositionEvent) => {
    event.stopPropagation();
    const value = (event.target as HTMLInputElement).value;
    query = value;
    await renderList(value);
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.isComposing) {
      return;
    }
    const emptyList = !!listElement?.querySelector(".b3-list--empty");
    if (!emptyList && listElement) {
      upDownHint(listElement, event);
    }
    if (event.key === "Enter") {
      const currentElement = listElement?.querySelector(".b3-list-item--focus") as HTMLElement;
      if (!emptyList || event.shiftKey) {
        callback?.(currentElement?.getAttribute("data-value"), dialog, event.shiftKey, query);
      }
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const focusDirection = (key: "ArrowUp" | "ArrowDown") => {
    if (!listElement || listElement.querySelector(".b3-list--empty")) {
      return;
    }
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    upDownHint(listElement, event);
  };

  const handleItemClick = (path: string, event: MouseEvent) => {
    if (listElement) {
      const activeItems = listElement.querySelectorAll(".b3-list-item--focus");
      activeItems.forEach((element) => element.classList.remove("b3-list-item--focus"));
    }
    const target = event.currentTarget as HTMLElement;
    target?.classList.add("b3-list-item--focus");
    callback?.(path, dialog, false, query);
  };
</script>

<div class="fn__flex" style="max-height: 50vh">
  <div class="fn__flex-column" style="width: 100%">
    <div class="fn__flex" style="margin: 0 8px 4px 8px">
      <input
        class="b3-text-field fn__flex-1"
        bind:this={inputElement}
        bind:value={query}
        on:keydown={handleKeydown}
        on:input={handleInput}
        on:compositionend={handleCompositionEnd}
      />
      <span class="fn__space"></span>
      <span class="block__icon block__icon--show" on:click={() => focusDirection("ArrowUp")}>
        <svg><use xlink:href="#iconLeft"></use></svg>
      </span>
      <span class="fn__space"></span>
      <span class="block__icon block__icon--show" on:click={() => focusDirection("ArrowDown")}>
        <svg><use xlink:href="#iconRight"></use></svg>
      </span>
    </div>
    <div class="b3-list fn__flex-1 b3-list--background" style="position: relative" bind:this={listElement}>
      {#if loading}
        <img
          style="margin: 0 auto; display: block; width: 64px; height: 64px"
          src="/stage/loading-pure.svg"
        />
      {:else if results.length}
        {#each results as item}
          <div
            class="b3-list-item"
            data-value={item.path}
            on:click={(event) => handleItemClick(item.path, event)}
          >
            <div class="b3-list-item__text">{item.hName}</div>
            <div class="b3-list-item__text" style="font-size: 0.7em">{item.path}</div>
          </div>
        {/each}
      {:else}
        <li class="b3-list--empty">{i18n.emptyContent}</li>
      {/if}
    </div>
    {#if showCreate}
      <div class="search__tip">
        <kbd>shift ↵</kbd> {i18n.create}
        <kbd>Esc</kbd> {i18n.exitSearch}
      </div>
    {/if}
  </div>
</div>
