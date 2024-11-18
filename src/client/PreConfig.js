/**
 * 
 * @param {import("@/index").default} drawioPlugin 
 * @returns 
 */
export function preConfig(drawioPlugin) {
    return function setup(global) {
      global.PLANT_URL = window?.siyuan?.config?.editor?.plantUMLServePath ?? 'https://www.plantuml.com/plantuml/svg/~1';;
      const {urlParams} = global
      urlParams['lang'] = getLang();
      
      const urlSearchParams = new URLSearchParams(location.search)
      if(urlSearchParams.get("lightbox") === "1" && !urlSearchParams.get("toolbar-config")) {
        urlParams["toolbar-config"] = JSON.stringify({
          refreshBtn: {}
        })
      } 
    }
}

function getLang(){
  let lang = window.siyuan.config.lang

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