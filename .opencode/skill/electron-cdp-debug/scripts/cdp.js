/**
 * CDP Debug Tool - Chrome DevTools Protocol utilities for Electron/Siyuan debugging
 * 
 * Usage:
 *   node cdp.js <port> <page-url-pattern> "<javascript-expression>"
 *   node cdp.js errors <port> <page-url-pattern>
 *   node cdp.js e2e <port> <page-url-pattern>
 *
 * Examples:
 *   node cdp.js 9223 "stage/build/app" "document.title"
 *   node cdp.js errors 9223 "stage/build/app"
 *   node cdp.js e2e 9223 "stage/build/app"
 */

const WebSocket = require('ws');

/**
 * Execute JavaScript expression on a CDP target page
 * @param {string} pageId - CDP page ID
 * @param {string} expr - JavaScript expression to evaluate
 * @param {number} port - CDP port (default: 9223)
 * @returns {Promise<any>} Evaluation result
 */
async function cdpEval(expr, pageId, port = 9223) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:' + port + '/devtools/page/' + pageId);
    ws.on('open', () => ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {expression: expr}})));
    ws.on('message', data => {
      const m = JSON.parse(data);
      if (m.id) {
        const v = m.result?.result;
        resolve(v?.value ?? v?.description ?? JSON.stringify(v));
        ws.close();
      }
    });
    ws.on('error', e => resolve('ws_error: ' + e.message));
    setTimeout(() => { ws.close(); resolve('timeout'); }, 5000);
  });
}

/**
 * Capture errors from a CDP page for a given duration
 * @param {string} pageId - CDP page ID
 * @param {number} duration - Capture duration in ms
 * @param {number} port - CDP port
 * @returns {Promise<string[]>} Array of error messages
 */
async function captureErrors(pageId, duration = 5000, port = 9223) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:' + port + '/devtools/page/' + pageId);
    const errors = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({id: 1, method: 'Runtime.enable'}));
      ws.send(JSON.stringify({id: 2, method: 'Console.enable'}));
    });
    ws.on('message', data => {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text;
        errors.push(desc?.substring(0, 500));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        const txt = msg.params.args.map(a => a.value || a.description || '').join(' ');
        errors.push(txt?.substring(0, 500));
      }
    });
    setTimeout(() => { ws.close(); resolve(errors); }, duration);
  });
}

/**
 * Find a page by URL pattern from CDP targets
 * @param {number} port - CDP port
 * @param {string} pattern - URL pattern to match
 * @returns {Promise<object|null>} Page object or null
 */
async function findPage(pattern, port = 9223) {
  const pages = await (await fetch('http://localhost:' + port + '/json/list')).json();
  return pages.find(p => p.url?.includes(pattern)) || null;
}

/**
 * List all available CDP targets
 * @param {number} port - CDP port
 * @returns {Promise<object[]>} Array of page objects
 */
async function listTargets(port = 9223) {
  return await (await fetch('http://localhost:' + port + '/json/list')).json();
}

// CLI interface
if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.length < 2) {
      console.log('Usage:');
      console.log('  node cdp.js <port> <page-pattern> "<expression>"');
      console.log('  node cdp.js errors <port> <page-pattern> [duration]');
      console.log('  node cdp.js e2e <port> <page-pattern> (run full E2E test)');
      console.log('  node cdp.js list [port] (list all targets)');
      process.exit(0);
    }

    const port = parseInt(args[0]) || 9223;

    if (args[0] === 'list') {
      const targets = await listTargets(args[1] ? parseInt(args[1]) : 9223);
      targets.forEach(t => console.log(t.type, '|', t.title?.substring(0, 60), '|', t.url?.substring(0, 100)));
      return;
    }

    const portNum = parseInt(args[0]);
    const pattern = args[1];
    const page = await findPage(pattern, portNum);

    if (!page) {
      console.log('No page found matching: ' + pattern);
      const targets = await listTargets(portNum);
      console.log('Available targets:');
      targets.forEach(t => console.log(' - ' + t.type + ' | ' + t.title + ' | ' + t.url?.substring(0, 80)));
      process.exit(1);
    }

    console.log('Using page:', page.title);

    if (args[2] === 'errors') {
      const duration = args[3] ? parseInt(args[3]) : 5000;
      const errors = await captureErrors(page.id, duration, portNum);
      if (errors.length > 0) {
        console.log('Errors captured (' + errors.length + '):');
        errors.forEach(e => console.log(e));
      } else {
        console.log('No errors captured');
      }
      return;
    }

    if (args[2] === 'e2e') {
      // Run E2E test flow (barPlugins -> submenu -> settings -> dialog)
      const errors = captureErrors(page.id, 8000, portNum);
      
      await cdpEval('document.getElementById("barPlugins")?.click()', page.id, portNum);
      await new Promise(r => setTimeout(r, 500));
      
      await cdpEval(`(function(){
        var items = document.querySelectorAll(".b3-menu__item");
        for(var i=0;i<items.length;i++){
          var t = items[i].textContent.trim();
          if(t.indexOf("draw.io")>=0||t.indexOf("drawio")>=0){
            items[i].dispatchEvent(new MouseEvent("mouseenter",{bubbles:true}));
            items[i].dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
            return "hovered:"+t;
          }
        }
        return "no drawio";
      })()`, page.id, portNum);
      
      console.log('Submenu opened');
      await new Promise(r => setTimeout(r, 800));
      
      await cdpEval(`(function(){
        var menus = document.querySelectorAll(".b3-menu__item");
        for(var i=0;i<menus.length;i++){
          var t = menus[i].textContent.trim();
          if(t.indexOf("设置")>=0){ menus[i].click(); return "clicked:"+t; }
        }
        return "no settings";
      })()`, page.id, portNum);
      
      console.log('Settings clicked');
      await new Promise(r => setTimeout(r, 3000));
      
      const dialog = await cdpEval(`(function(){
        var d = document.querySelector(".b3-dialog");
        if(!d) return "no dialog";
        var t = d.querySelector(".b3-dialog__header")?.textContent || "title missing";
        var c = d.querySelector(".b3-dialog__content")?.innerHTML?.substring(0, 200) || "empty";
        return JSON.stringify({title:t, content:c});
      })()`, page.id, portNum);
      console.log('Dialog:', dialog);
      
      const errs = await errors;
      if (errs.length > 0) {
        console.log('\nErrors:', errs);
      } else {
        console.log('\nNo errors!');
      }
      return;
    }

    // Standard eval mode
    const expr = args[2];
    const result = await cdpEval(expr, page.id, portNum);
    console.log('Result:', result);
  })().catch(console.error);
}

module.exports = { cdpEval, captureErrors, findPage, listTargets };
