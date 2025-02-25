<script lang="ts">
  import type DrawioPlugin from '@/index'
  import { showMessage } from 'siyuan';
  import { saveDrawIoXml, renameDrawIo } from '@/api';
    import { createUrlFromTitle, getFileName } from '@/link';
    import type { Asset } from '@/types';
    import { DRAWIO_EXTENSION } from '@/constants';

  export let type;
  export let oldName = '';
  export let asset: Asset = undefined;
  export let onSave;
  export let plugin: DrawioPlugin;

  const InvalidPathChar = [
    "\\",
    "/",
    ":",
    "*",
    "?",
    '"',
    "<",
    ">",
    "|",
    "$",
    "&",
    "^",
    ".",
  ];

  let name = asset ? getFileName(asset.hName) : '';

  const save = (name) => {
    const result = name.trim();
    if (!result || InvalidPathChar.some((v) => result.indexOf(v) !== -1)) {
      showMessage(plugin.i18n.nameIsInvalid.replace("${name}", name));
      return;
    }
    if (type === "create") {
      saveDrawIoXml(name).then((data) => {
          const url = data["succMap"][name] || data["succMap"][name + DRAWIO_EXTENSION]
          onSave && onSave(url);
        }).catch(e => {
          console.error(e)
          showMessage(e, 6000, "error")
        });
    } else {
        if(name != getFileName(asset.hName)) {
            renameDrawIo(name, asset.path).then(() => {
                onSave && onSave(createUrlFromTitle(name));
            }).catch(e => {
                console.error(e)
                showMessage(e, 6000, "error")
            });
        }
    }
  };

  const handleKeyUp = (e) => {
    if (e.key === "Enter") {
      save(e.target.value);
    }
  };
</script>

<div class="{type == 'create' ? 'create-whiteboard' : 'rename-whiteboard'}">
  <label class="fn__flex-column b3-label config__item">
    <div class="fn__flex-1 mb-8">
      {plugin.i18n.form.name}
      <div class="b3-label__text">
        {plugin.i18n.form.nameDesc}
      </div>
    </div>
    <span class="fn__space"></span>
    <input
      id="draw-name"
      class="b3-text-field fn__flex-center w-full"
      bind:value={name}
      on:keyup={handleKeyUp}
    />
  </label>
  <div class="button-group" style="float: right; margin: 20px 0 10px">
    <button id="saveDraw" class="b3-button" on:click={() => save(name)}>
      {plugin.i18n.form.save}
    </button>
  </div>
</div>
