/**
 * 
 * @param {import("@/index").default} drawioPlugin 
 * @returns 
 */
export function preConfig(drawioPlugin) {
    return function setup(global) {
        const {urlParams} = global

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
        
        urlParams['lang'] = getLang();
        
        const urlSearchParams = new URLSearchParams(location.search)
        if(urlSearchParams.get("lightbox") === "1" && !urlSearchParams.get("toolbar-config")) {
          urlParams["toolbar-config"] = JSON.stringify({
            refreshBtn: {}
          })
        } 
    }
}