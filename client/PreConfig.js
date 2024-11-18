import {Workbox} from 'workbox-window';

if(process.env.NODE_ENV !== 'development'){
  if ('serviceWorker' in navigator) {
    const wb = new Workbox('service-worker.js');

    wb.register();
  }
} else {
  console.log("process.env.NODE_ENV = ", process.env.NODE_ENV)
  urlParams['test'] = '1';
}
/**
 * Copyright (c) 2006-2024, JGraph Ltd
 * Copyright (c) 2006-2024, draw.io AG
 */
// Overrides of global vars need to be pre-loaded
window.DRAWIO_PUBLIC_BUILD = true;
window.DRAWIO_BASE_URL = "/plugins/siyuan-drawio-plugin/webapp"; // Replace with path to base of deployment, e.g. https://www.example.com/folder
window.DRAWIO_LIGHTBOX_URL = window.DRAWIO_BASE_URL; // Replace with your lightbox URL, eg. https://www.example.com
window.DRAW_MATH_URL = 'math/es5';
window.DRAWIO_CONFIG = null;; // Replace with your custom draw.io configurations. For more details, https://www.drawio.com/doc/faq/configure-diagram-editor
urlParams['sync'] = 'manual';
// urlParams['offline'] = '1';
urlParams['mode'] = 'device'
urlParams["gapi"]=0 //: Disables the Google integration.
urlParams["db"]=0 //: Disables the Dropbox integration.
urlParams["od"]=0 //: Disables the OneDrive integration.
urlParams["tr"]=0 //: Disables the Trello integration.
urlParams["gh"]=0 //: Disables the GitHub integration.
urlParams["gl"]=0 //: Disables the GitLab integration.

if(window.parent.drawioPlugin) {
  window.parent.drawioPlugin.preConfig(window)
}