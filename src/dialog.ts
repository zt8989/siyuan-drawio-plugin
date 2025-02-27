import { Dialog } from 'siyuan';
import DialogContent from '@/components/dialog-content.svelte';
import { Asset } from './types';

export const addWhiteboard = (plugin, callback) => {
  const d = new Dialog({
    title: plugin.i18n.createWhiteboard,
    content: `<div class="b3-dialog__content"><div id="create-whiteboard"></div></div>`,
    width: "800px",
  });
  let root: DialogContent;
  const props = {
    plugin,
    type: 'create',
    oldName: '',
    onSave: (name) => {
        d.destroy();
        callback(name);
    }
  }
  root = new DialogContent({
    target: d.element.querySelector(".b3-dialog__content"),
    props: props
  })
};

export const renameWhiteboard = (plugin, asset: Asset, callback) => {
    const d = new Dialog({
      title: plugin.i18n.renameWhiteboard,
      content: `<div class="b3-dialog__content"></div>`,
      width: "800px",
    });
    let root: DialogContent;
    const props = {
      plugin,
      type: 'rename',
      asset,
      onSave: (newName) => {
          d.destroy();
          callback(newName);
      }
    }
    root = new DialogContent({
        target: d.element.querySelector(".b3-dialog__content"),
        props: props
      })
  };
