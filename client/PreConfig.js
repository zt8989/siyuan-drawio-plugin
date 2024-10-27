/**
 * Copyright (c) 2006-2024, JGraph Ltd
 * Copyright (c) 2006-2024, draw.io AG
 */
// Overrides of global vars need to be pre-loaded
window.DRAWIO_PUBLIC_BUILD = true;
window.EXPORT_URL = 'REPLACE_WITH_YOUR_IMAGE_SERVER';
window.PLANT_URL = 'REPLACE_WITH_YOUR_PLANTUML_SERVER';
window.DRAWIO_BASE_URL = null; // Replace with path to base of deployment, e.g. https://www.example.com/folder
window.DRAWIO_VIEWER_URL = null; // Replace your path to the viewer js, e.g. https://www.example.com/js/viewer.min.js
window.DRAWIO_LIGHTBOX_URL = null; // Replace with your lightbox URL, eg. https://www.example.com
window.DRAW_MATH_URL = 'math/es5';
window.DRAWIO_CONFIG = null; // Replace with your custom draw.io configurations. For more details, https://www.drawio.com/doc/faq/configure-diagram-editor
window.LANG = parent.siyuan.config.lang
urlParams['sync'] = 'manual';
// urlParams['offline'] = '0';
urlParams['mode'] = 'device'
urlParams['test'] = '1';
urlParams["gapi"]=0 //: Disables the Google integration.
urlParams["db"]=0 //: Disables the Dropbox integration.
urlParams["od"]=0 //: Disables the OneDrive integration.
urlParams["tr"]=0 //: Disables the Trello integration.
urlParams["gh"]=0 //: Disables the GitHub integration.
urlParams["gl"]=0 //: Disables the GitLab integration.
