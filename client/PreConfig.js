import { DefaultElectronImpl } from './Electron.js';
import Storage from './Storage.js';
import { getDrawioLang } from '@/bridge/DrawioBridge';
import { installAiStreamPatch } from './AiStreamPatch.js';

// AI chat streaming (SSE + 思考中 UI): installed before the fence patch so
// the stream uses pristine fetch; classic fallback still flows through it.
installAiStreamPatch();

window.isLocalStorage = true
const storage = window.storage = new Storage();

if(process.env.NODE_ENV === 'development'){
    urlParams['test'] = '1';
  }

   /**
    * Copyright (c) 2006-2024, JGraph Ltd
    * Copyright (c) 2006-2024, draw.io AG
    */
   // Overrides of global vars need to be pre-loaded
  // Delegate to DrawioBridge single source of truth (locality) — client previously duplicated this logic
function getLang(){
    return getDrawioLang(parent?.siyuan?.config?.lang)
  }
  function toFullChatCompletionsUrl(baseUrl) {
      if (!baseUrl) return 'https://api.openai.com/v1/chat/completions';
      const t = baseUrl.replace(/\/+$/, '');
      if (t.includes('chat/completions') || t.includes('generateContent') || t.includes('v1/messages')) return t;
      if (t.endsWith('/v1')) return t + '/chat/completions';
      return t + '/v1/chat/completions';
  }
  window.DRAWIO_PUBLIC_BUILD = true;
  window.PLANT_URL = parent?.siyuan?.config?.editor?.plantUMLServePath.replace("/svg/~1", "") ?? 'https://www.plantuml.com/plantuml';;
  window.DRAWIO_BASE_URL = "/plugins/siyuan-drawio-plugin/webapp/"; // Replace with path to base of deployment, e.g. https://www.example.com/folder
  window.DRAWIO_VIEWER_URL = "/plugins/siyuan-drawio-plugin/webapp/js/viewer.min.js"; // Replace your path to the viewer js, e.g. https://www.example.com/js/viewer.min.js
  window.DRAWIO_LIGHTBOX_URL = "/plugins/siyuan-drawio-plugin/webapp"; // Replace with your lightbox URL, eg. https://www.example.com
  window.DRAW_MATH_URL = 'math/es5';
  // AI config: reuse SiYuan provider, controlled by plugin toggle aiEnabled (default true)
  function getAiDrawioConfig() {
      try {
          // 1) plugin toggle
          let aiEnabled = true;
          try {
              const raw = window.localStorage.getItem('.drawio-config') || parent?.localStorage?.getItem('.drawio-config');
              if (raw) {
                  const c = JSON.parse(raw);
                  if (typeof c.aiEnabled === 'boolean') aiEnabled = c.aiEnabled;
              }
          } catch {}
          if (!aiEnabled) {
              return { enableAi: false, aiActions: [] };
          }
          // 2) SiYuan provider (sync read from parent window if available) — supports legacy OpenAI and 3.8+ providers[]
          const ai = parent?.siyuan?.config?.ai || parent?.siyuan?.config?.AI || window.siyuan?.config?.ai;
          // legacy
          const openAI = ai?.OpenAI || ai?.openAI;
          if (openAI?.APIKey) {
              const model = openAI.APIModel || 'gpt-4o-mini';
              const baseUrl = toFullChatCompletionsUrl(openAI.APIBaseURL || 'https://api.openai.com/v1/chat/completions');
              return {
                  enableAi: true,
                  gptApiKey: openAI.APIKey,
                  gptUrl: baseUrl,
                  gptModel: model,
                  // 不覆盖 aiGlobals.create/update，复用上游 Editor.aiGlobals 默认值（避免硬编码提示词）
                  aiConfigs: {
                      gpt: {
                          apiKey: 'gptApiKey',
                          endpoint: baseUrl,
                          requestHeaders: { Authorization: 'Bearer {apiKey}' },
                          request: { model: '{model}', messages: [{ role: 'system', content: '{action}' }, { role: 'user', content: '{prompt}' }] },
                          responsePath: '$.choices[0].message.content'
                      }
                  },
                  aiModels: [{ name: model, model, config: 'gpt' }]
              };
          }
          // 3.8+ providers array
          if (Array.isArray(ai?.providers)) {
              const p = ai.providers.find(x => x.enabled && x.apiKey) || ai.providers.find(x => x.apiKey);
              if (p?.apiKey) {
                  const m = p.models?.find(x => x.enabled) || p.models?.[0];
                  const model = m?.name || 'gpt-4o-mini';
                  const baseUrl = toFullChatCompletionsUrl(p.baseURL || 'https://api.openai.com/v1/chat/completions');
                  return {
                      enableAi: true,
                      gptApiKey: p.apiKey,
                      gptUrl: baseUrl,
                      gptModel: model,
                      // 不覆盖 aiGlobals.create/update，复用上游
                      aiConfigs: {
                          gpt: {
                              apiKey: 'gptApiKey',
                              endpoint: baseUrl,
                              requestHeaders: { Authorization: 'Bearer {apiKey}' },
                              request: { model: '{model}', messages: [{ role: 'system', content: '{action}' }, { role: 'user', content: '{prompt}' }] },
                              responsePath: '$.choices[0].message.content'
                          }
                      },
                      aiModels: [{ name: model, model, config: 'gpt' }]
                  };
              }
          }
          // no SiYuan key -> enable but only Clipboard backend (draw.io default)
          return { enableAi: true };
      } catch {
          return { enableAi: true };
      }
  }
  window.DRAWIO_CONFIG = getAiDrawioConfig(); // Replace with your custom draw.io configurations. For more details, https://www.drawio.com/doc/faq/configure-diagram-editor
  // Patch AI response: strip markdown fences (```mermaid) that DeepSeek returns — fixes "Text is not SVG"
  (function patchAiFence() {
      try {
          const origOpen = XMLHttpRequest.prototype.open;
          const origSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(m, u) { this._aiUrl = u; return origOpen.apply(this, arguments); };
          XMLHttpRequest.prototype.send = function(b) {
              if (this._aiUrl && (this._aiUrl.includes('deepseek') || this._aiUrl.includes('chat/completions'))) {
                  this.addEventListener('readystatechange', function() {
                      if (this.readyState === 4 && this.status === 200) {
                          try {
                              const j = JSON.parse(this.responseText);
                              const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
                              if (c && c.includes('```')) {
                                  const stripped = c.replace(/```mermaid\s*/g, '').replace(/```\s*/g, '').trim();
                                  j.choices[0].message.content = stripped;
                                  const patched = JSON.stringify(j);
                                  Object.defineProperty(this, 'responseText', { value: patched, configurable: true });
                                  Object.defineProperty(this, 'response', { value: patched, configurable: true });
                              }
                          } catch (e) {}
                      }
                  });
              }
              return origSend.apply(this, arguments);
          };
          if (window.fetch) {
              const origFetch = window.fetch;
              window.fetch = async function(input, init) {
                  const url = typeof input === 'string' ? input : (input && input.url) || '';
                  const res = await origFetch.apply(this, arguments);
                  if (url.includes('deepseek') || url.includes('chat/completions')) {
                      try {
                          const clone = res.clone();
                          const txt = await clone.text();
                          if (txt.includes('```')) {
                              const j = JSON.parse(txt);
                              const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
                              if (c && c.includes('```')) {
                                  const stripped = c.replace(/```mermaid\s*/g, '').replace(/```\s*/g, '').trim();
                                  j.choices[0].message.content = stripped;
                                  const patched = JSON.stringify(j);
                                  return new Response(patched, { status: res.status, statusText: res.statusText, headers: res.headers });
                              }
                          }
                      } catch (e) {}
                  }
                  return res;
              };
          }
      } catch (e) {}
  })();
  urlParams['sync'] = 'manual';
  // urlParams['offline'] = '1';
  urlParams['mode'] = 'device'
  // Restore draw.io template chooser (splash) for new file – 31.4.2 defaults to blank when mode=device + electron
  urlParams['splash'] = '1'
  urlParams["gapi"]=0 //: Disables the Google integration.
  urlParams["db"]=0 //: Disables the Dropbox integration.
  urlParams["od"]=0 //: Disables the OneDrive integration.
  urlParams["tr"]=0 //: Disables the Trello integration.
  urlParams["gh"]=0 //: Disables the GitHub integration.
  urlParams["gl"]=0 //: Disables the GitLab integration.

  if(parent.siyuan) {
    urlParams['lang'] = getLang();
    window.electron = new DefaultElectronImpl()
    storage.setElectron(electron)
  }

  const urlSearchParams = new URLSearchParams(location.search)
  if(urlSearchParams.get("lightbox") === "1" && !urlSearchParams.get("toolbar-config")) {
    urlParams["toolbar-config"] = JSON.stringify({
      refreshBtn: {}
    })
  }
