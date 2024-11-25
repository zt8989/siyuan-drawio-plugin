  if(process.env.NODE_ENV === 'development'){
    urlParams['test'] = '1';
  }
  /**
   * Copyright (c) 2006-2024, JGraph Ltd
   * Copyright (c) 2006-2024, draw.io AG
   */
  // Overrides of global vars need to be pre-loaded
  function getLang(){
    let lang = parent?.siyuan.config.lang

    if (lang != null)
      {
        var dash = lang.indexOf('_');
        
        if (dash >= 0)
        {
          lang = lang.substring(0, dash);
        }
        
        lang = lang.toLowerCase();
      }

      return lang
  }
  window.DRAWIO_PUBLIC_BUILD = true;
  window.PLANT_URL = parent?.siyuan?.config?.editor?.plantUMLServePath ?? 'https://www.plantuml.com/plantuml/svg/~1';;
  window.DRAWIO_BASE_URL = "/plugins/siyuan-drawio-plugin/webapp/"; // Replace with path to base of deployment, e.g. https://www.example.com/folder
  window.DRAWIO_VIEWER_URL = "/plugins/siyuan-drawio-plugin/webapp/js/viewer.min.js"; // Replace your path to the viewer js, e.g. https://www.example.com/js/viewer.min.js
  window.DRAWIO_LIGHTBOX_URL = "/plugins/siyuan-drawio-plugin/webapp"; // Replace with your lightbox URL, eg. https://www.example.com
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

  if(parent.siyuan) {
    urlParams['lang'] = getLang();
  }

  const urlSearchParams = new URLSearchParams(location.search)
  if(urlSearchParams.get("lightbox") === "1" && !urlSearchParams.get("toolbar-config")) {
    urlParams["toolbar-config"] = JSON.stringify({
      refreshBtn: {}
    })
  } 