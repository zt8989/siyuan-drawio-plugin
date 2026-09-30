import { buildChatParams } from '@/ai/AiStreamUtils';

/**
 * AiGeneratePatch — reroutes the template-chooser Generate button from the
 * draw.io hosted service to the SiYuan BYO model backend.
 *
 * Upstream `generateOpenAiMermaidDiagram` POSTs to
 * https://www.draw.io/generate/v3, which rejects non-draw.io origins with
 * "Unauthorized. Request must come from an authorized draw.io domain", so
 * the button can never work inside this self-hosted plugin. When a SiYuan
 * provider key exists, this override sends the same prompt to the configured
 * chat/completions endpoint instead (the AiStreamPatch streaming upgrade
 * applies automatically, so whale-scale prompts survive), then runs the same
 * result classification as upstream: mxGraphModel extraction, truncation
 * repair, raw XML passthrough, mermaid parse + group wrap. Without a key it
 * falls back to the original implementation.
 */

function readByoConfig() {
    try {
        var aiEnabled = true;
        try {
            var raw = window.localStorage.getItem('.drawio-config') || (window.parent && window.parent.localStorage.getItem('.drawio-config'));
            if (raw) {
                var c = JSON.parse(raw);
                if (typeof c.aiEnabled === 'boolean') aiEnabled = c.aiEnabled;
            }
        } catch (e) { /* ignore */ }
        if (!aiEnabled) return null;
        var ai = null;
        try {
            ai = (window.parent && window.parent.siyuan && window.parent.siyuan.config && window.parent.siyuan.config.ai) ||
                (window.siyuan && window.siyuan.config && window.siyuan.config.ai) || null;
        } catch (e) {
            ai = null;
        }
        if (ai == null) return null;
        var openAI = ai.OpenAI || ai.openAI;
        if (openAI && openAI.APIKey) {
            return { apiKey: openAI.APIKey, model: openAI.APIModel || 'gpt-4o-mini', baseUrl: openAI.APIBaseURL || 'https://api.openai.com/v1/chat/completions' };
        }
        if (Array.isArray(ai.providers)) {
            var p = ai.providers.find(function (x) { return x.enabled && x.apiKey; }) || ai.providers.find(function (x) { return x.apiKey; });
            if (p && p.apiKey) {
                var models = p.models || [];
                var m = models.find(function (x) { return x.enabled; }) || models[0];
                return { apiKey: p.apiKey, model: (m && m.name) || 'gpt-4o-mini', baseUrl: p.baseURL || 'https://api.openai.com/v1/chat/completions' };
            }
        }
    } catch (e) { /* fall through to upstream */ }
    return null;
}

function toFullChatCompletionsUrl(baseUrl) {
    if (!baseUrl) return 'https://api.openai.com/v1/chat/completions';
    var t = String(baseUrl).replace(/\/+$/, '');
    if (t.includes('chat/completions') || t.includes('generateContent') || t.includes('v1/messages')) return t;
    if (t.endsWith('/v1')) return t + '/chat/completions';
    return t + '/v1/chat/completions';
}

function readResponseContent(responseText) {
    var response = JSON.parse(responseText);
    var result = Editor.executeSimpleJsonPath(response, '$.choices[0].message.content');
    var text = mxUtils.trim((result.length > 0) ? result[0] : responseText);
    return { response: response, text: text };
}

// Mirrors the classification tail of upstream generateOpenAiMermaidDiagram:
// model text -> draw.io XML for the success callback.
function classifyModelText(editorUi, text, success, handleError, retry) {
    try {
        var parsed = Editor.extractGraphModelFromText(text);
        var partial = false;
        if ((parsed == null || parsed[1] == '') && text.indexOf('<mxGraphModel') >= 0) {
            var repaired = Editor.repairTruncatedXml(text);
            if (repaired != null) {
                parsed = Editor.extractGraphModelFromText(repaired);
                partial = parsed[1] != '';
            }
        }
        if (parsed != null && parsed[1] != '') {
            success(parsed[1], partial);
            return;
        }
        if (mxUtils.trim(text).charAt(0) == '<') {
            success(text);
            return;
        }
        var mermaid = editorUi.extractMermaidDeclaration(text) || text;
        editorUi.parseMermaidDiagram(mermaid, null, mxUtils.bind(editorUi, function (xml) {
            editorUi.tryAndHandle(mxUtils.bind(editorUi, function () {
                success(mxMermaidToDrawio.wrapGroup(xml, mermaid, EditorUi.getInsertMermaidConfig()));
            }), handleError);
        }), handleError, retry);
    } catch (e) {
        handleError(e);
    }
}

export function installAiGeneratePatch() {
    try {
        if (typeof EditorUi === 'undefined' || EditorUi.prototype == null) return;
        if (EditorUi.prototype.__siyuanGeneratePatched) return;
        EditorUi.prototype.__siyuanGeneratePatched = true;
        var origGenerate = EditorUi.prototype.generateOpenAiMermaidDiagram;

        EditorUi.prototype.generateOpenAiMermaidDiagram = function (prompt, success, error, options) {
            var cfg = readByoConfig();
            if (cfg == null) {
                return origGenerate.apply(this, arguments);
            }
            var editorUi = this;
            editorUi.createTimeout(editorUi.editor.generateTimeout, mxUtils.bind(editorUi, function (timeout) {
                var handleError = function (e) {
                    if (timeout.clear()) {
                        if (e != null && e.retry == null) {
                            e.retry = function () {
                                editorUi.generateOpenAiMermaidDiagram(prompt, success, error, options);
                            };
                        }
                        error(e);
                    }
                };
                var url = toFullChatCompletionsUrl(cfg.baseUrl);
                var action = 'create';
                try {
                    if (Editor.aiGlobals && Editor.aiGlobals.create) action = Editor.aiGlobals.create;
                } catch (e) { /* keep default */ }
                var params = buildChatParams(cfg.model, action, prompt);
                var req = new mxXmlRequest(url, JSON.stringify(params), 'POST');
                req.setRequestHeaders = function (request) {
                    request.setRequestHeader('Content-Type', 'application/json');
                    request.setRequestHeader('Authorization', 'Bearer ' + cfg.apiKey);
                };
                EditorUi.debug('EditorUi.generateOpenAiMermaidDiagram.byo', 'url', url, 'model', cfg.model);
                req.send(function (req) {
                    if (!timeout.clear()) return;
                    try {
                        if (req.getStatus() >= 200 && req.getStatus() <= 299) {
                            var read = readResponseContent(req.getText());
                            EditorUi.debug('EditorUi.generateOpenAiMermaidDiagram.byo.response', 'text', [read.text]);
                            classifyModelText(editorUi, read.text, function (xml, partial) {
                                if (timeout.clear()) success(xml, partial);
                            }, handleError);
                        } else {
                            var result = 'Error: ' + req.getStatus();
                            try {
                                var resp = JSON.parse(req.getText());
                                if (resp != null && resp.error != null && resp.error.message != null) {
                                    result = resp.error.message;
                                }
                            } catch (e) { /* ignore */ }
                            handleError({ message: result });
                        }
                    } catch (e) {
                        handleError(e);
                    }
                }, handleError);
            }), error);
        };
    } catch (e) { /* keep upstream implementation when patching fails */ }
}
