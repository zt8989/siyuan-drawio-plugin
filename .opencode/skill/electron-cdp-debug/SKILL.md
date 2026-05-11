---
name: electron-cdp-debug
description: Debug Electron/Chromium desktop apps via Chrome DevTools Protocol. Connect to running Electron processes, execute JavaScript on live pages, capture runtime errors, and perform E2E UI interaction tests. Use when debugging Electron app behavior, capturing console/runtime errors from plugins, testing UI flows programmatically, or inspecting DOM structure of Electron windows.
---

# Electron CDP Debugging

## Quick Start

All `scripts/cdp.js` paths are relative to the skill directory.

1. **Start app with CDP port**:
```bash
/Applications/Siyuan.app/Contents/MacOS/SiYuan --remote-debugging-port=9223 --workspace=/path/to/workspace
```

2. **List targets**:
```bash
node scripts/cdp.js list 9223
```

3. **Execute JS**:
```bash
node scripts/cdp.js 9223 "stage/build/app" "document.title"
```

4. **Capture errors** (5s window):
```bash
node scripts/cdp.js 9223 "stage/build/app" errors
```

5. **Run E2E flow**:
```bash
node scripts/cdp.js 9223 "stage/build/app" e2e
```

## Common Workflows

### Execute JavaScript via CDP

Use `scripts/cdp.js` (run from skill directory) or inline Node.js:

```bash
node scripts/cdp.js <port> "<url-pattern>" "<expression>"
```

### Capture Errors

```bash
node scripts/cdp.js <port> "<url-pattern>" errors [duration_ms]
```

Or embed in a script:

```javascript
const { captureErrors, findPage, cdpEval } = require('./scripts/cdp.js');
// Run from skill directory
const page = await findPage('stage/build/app', 9223);
const errors = await captureErrors(page.id, 5000);
```

### E2E UI Testing

1. **Click by selector**:
```javascript
cdpEval('document.getElementById("barPlugins")?.click()', page.id, port);
```

2. **Hover to open submenu** (not just click):
```javascript
cdpEval(`(function(){
  var items = document.querySelectorAll(".b3-menu__item");
  for(var i=0;i<items.length;i++){
    if(items[i].textContent.includes("target-text")){
      items[i].dispatchEvent(new MouseEvent("mouseenter",{bubbles:true}));
      return "opened";
    }
  }
  return "not found";
})()`, page.id, port);
```

3. **Click by text match**:
```javascript
cdpEval(`(function(){
  var m = document.querySelectorAll(".b3-menu__item");
  for(var i=0;i<m.length;i++){ if(m[i].textContent.includes("按钮文字")){ m[i].click(); return"ok"; } }
  return "not found";
})()`, page.id, port);
```

4. **Wait after each action**: `await new Promise(r => setTimeout(r, 2000));`

## Troubleshooting

### "target is a required option" (Svelte mount failure)

`querySelector()` returned `null`, Svelte component can't mount.

**Fix**: Mount target to Dialog's content class:

```typescript
content: `<div class="b3-dialog__content" style="height:100%"></div>`,
target: dialog.element.querySelector(".b3-dialog__content")
```

### V8 cache prevents code reload

Electron caches compiled JS, updated `dev/index.js` not reflected.

**Fix**: Kill and relaunch the Electron app.

### Connection refused

Port occupied or app not started with `--remote-debugging-port`. Use `lsof -i :<port>` to check.

## Target App Notes (Siyuan)

- Plugin menu: `#barPlugins` → hover submenu → click "设置"
- Dialog DOM: `.b3-dialog` → `.b3-dialog__header` (title) → `.b3-dialog__content` (body)
- Plugin instance: `window.drawioPlugin`
