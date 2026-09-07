import {
    FIRST_BYTE_TIMEOUT_MS,
    OVERALL_TIMEOUT_MS,
    buildChatCompletionsJson,
    extractClassicContent,
    extractDelta,
    extractErrorMessage,
    formatThinkingPreview,
    isStreamableAiUrl,
    splitSseEvents,
    stripMarkdownFences,
    withStreamFlag,
} from '@/ai/AiStreamUtils';

/**
 * AiStreamPatch — upgrades draw.io AI chat (gpt / chat/completions) from
 * one-shot mxXmlRequest to SSE streaming without touching the drawio
 * submodule (same convention as the fence-strip patch in PreConfig.js).
 *
 * - Request: adds `stream: true`, reads SSE deltas via fetch.
 * - Progress: replaces the "loading..." bubble with a grey "思考中 ..."
 *   row (latest thinking line, truncated) plus normal-style partial text.
 *   The upstream final render starts with `target.innerHTML = ''`, so it
 *   cleanly replaces the progressive UI.
 * - Completion: synthesizes a normal-shaped JSON body
 *   (`choices[0].message.content`, fences stripped) and fires the XHR
 *   readystatechange the upstream mxXmlRequest callback waits for, so
 *   responsePath / retry / truncation-repair paths are unchanged.
 * - Fallback: servers that ignore `stream: true` (full JSON body) or fail
 *   before the first byte fall back to the classic one-shot XHR.
 *
 * Timeout policy: FIRST_BYTE_TIMEOUT_MS (90s, aligned with the legacy
 * generateTimeout) aborts a silent stream; OVERALL_TIMEOUT_MS (10min) caps
 * the whole stream — partial content finalizes (upstream shows its partial
 * hint via truncation repair), nothing-received surfaces an error with
 * retry. Editor.prototype.generateTimeout is raised to the same overall
 * budget so the upstream timer never kills an active stream first.
 */

var lastScrollAt = 0;

function emit(name, detail) {
    // Observability hook for e2e (and debugging): thinking progress and
    // completion are visible even when the stream resolves in one read.
    try {
        window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) { /* ignore */ }
}

function thinkingLabel() {
    try {
        var v = window.mxResources ? window.mxResources.get('thinking') : null;
        if (typeof v === 'string' && v !== '' && v.indexOf('thinking') < 0) return v;
    } catch (e) { /* fall through */ }
    return '思考中';
}

function findWaitingBubble() {
    try {
        var loading = (window.mxResources ? window.mxResources.get('loading') : null) || 'Loading';
        var divs = document.getElementsByTagName('div');
        for (var i = divs.length - 1; i >= 0; i--) {
            var el = divs[i];
            var text = el.textContent || '';
            if (text.length < loading.length + 24 && text.indexOf(loading) === 0 && el.querySelector('img') != null) {
                return el.parentElement || el;
            }
        }
    } catch (e) { /* graceful: no progressive UI */ }
    return null;
}

function renderProgress(waiting, reasoning, content) {
    if (waiting == null || waiting.parentNode == null) return;
    if (reasoning === '' && content === '') return;
    try {
        waiting.innerHTML = '';
        if (reasoning !== '') {
            var preview = formatThinkingPreview(reasoning);
            var think = document.createElement('div');
            think.style.color = '#888';
            think.style.fontSize = '12px';
            // Single line with ellipsis: the preview text is already
            // truncated, the row itself must never wrap into a cut-off
            // second line inside the narrow chat bubble.
            think.style.whiteSpace = 'nowrap';
            think.style.overflow = 'hidden';
            think.style.textOverflow = 'ellipsis';
            think.style.maxWidth = '100%';
            think.textContent = thinkingLabel() + ' ' + (preview !== '' ? preview : '') + '...';
            waiting.appendChild(think);
            emit('drawio-ai-stream-thinking', { preview: preview });
        }
        if (content !== '') {
            var body = document.createElement('div');
            body.style.whiteSpace = 'pre-wrap';
            body.textContent = stripMarkdownFences(content);
            waiting.appendChild(body);
        }
        var now = Date.now();
        if (now - lastScrollAt > 250) {
            lastScrollAt = now;
            waiting.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
        }
    } catch (e) { /* never break the stream on UI errors */ }
}

function defineXhrResult(xhr, status, bodyText) {
    var define = function (key, value) {
        try {
            Object.defineProperty(xhr, key, { value: value, configurable: true });
        } catch (e) { /* ignore */ }
    };
    define('readyState', 4);
    define('status', status);
    define('statusText', status === 200 ? 'OK' : 'Error');
    define('responseText', bodyText);
    define('response', bodyText);
}

function completeXhr(xhr, status, bodyText) {
    defineXhrResult(xhr, status, bodyText);
    try {
        if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
    } catch (e) { /* upstream handler owns errors from here */ }
}

function readBodyText(res) {
    return res.text().then(function (t) { return t; }, function () { return ''; });
}

function runStream(xhr, url, streamBody, originalBody, fetchFn) {
    var waiting = findWaitingBubble();
    var headers = { 'Content-Type': 'application/json' };
    try {
        var recorded = xhr._aiHeaders || {};
        for (var k in recorded) headers[k] = recorded[k];
    } catch (e) { /* ignore */ }

    var ctrl = null;
    try {
        ctrl = new AbortController();
    } catch (e) {
        xhr._aiStreamFallback = true;
        XMLHttpRequest.prototype.send.call(xhr, originalBody);
        return;
    }
    var firstByteTimer = setTimeout(function () {
        try { ctrl.abort('first-byte-timeout'); } catch (e) { /* ignore */ }
    }, FIRST_BYTE_TIMEOUT_MS);
    var overallTimer = setTimeout(function () {
        try { ctrl.abort('overall-timeout'); } catch (e) { /* ignore */ }
    }, OVERALL_TIMEOUT_MS);
    var settled = false;
    var clearTimers = function () {
        if (settled) return;
        settled = true;
        clearTimeout(firstByteTimer);
        clearTimeout(overallTimer);
    };

    fetchFn(url, { method: 'POST', headers: headers, body: streamBody, signal: ctrl.signal }).then(function (res) {
        if (!res.ok || res.body == null) {
            return readBodyText(res).then(function (errText) {
                clearTimers();
                // Nothing streamed yet: let upstream show its error + retry UI.
                completeXhr(xhr, res.status || 500, errText !== '' ? errText :
                    JSON.stringify({ error: { message: extractErrorMessage(res.status || 500, '') } }));
            });
        }
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        var content = '';
        var reasoning = '';
        var gotFirst = false;

        var pump = function () {
            return reader.read().then(function (step) {
                if (step.done) return false;
                if (!gotFirst) {
                    gotFirst = true;
                    clearTimeout(firstByteTimer);
                }
                buf += decoder.decode(step.value, { stream: true });
                var split = splitSseEvents(buf);
                buf = split.rest;
                for (var i = 0; i < split.events.length; i++) {
                    var d = extractDelta(split.events[i]);
                    content += d.content;
                    reasoning += d.reasoning;
                    if (d.done) {
                        try { reader.cancel(); } catch (e) { /* ignore */ }
                        renderProgress(waiting, reasoning, content);
                        return false;
                    }
                }
                renderProgress(waiting, reasoning, content);
                return true;
            });
        };

        var loop = function () {
            return pump().then(function (more) {
                if (more) return loop();
                buf += decoder.decode();
                // Server ignored stream:true and returned full JSON.
                if (content === '' && reasoning === '') {
                    var classic = extractClassicContent((buf || '').trim() !== '' ? buf : '');
                    if (classic != null) content = classic;
                }
                clearTimers();
                clearTimeout(overallTimer);
                if (content === '' && reasoning === '') {
                    // Empty stream (e.g. aborted before first byte): retry classic once.
                    try {
                        xhr._aiStreamFallback = true;
                        XMLHttpRequest.prototype.send.call(xhr, originalBody);
                    } catch (e) {
                        completeXhr(xhr, 504, JSON.stringify({ error: { message: extractErrorMessage(504, '') } }));
                    }
                    return;
                }
                completeXhr(xhr, 200, buildChatCompletionsJson(content, reasoning));
                emit('drawio-ai-stream-done', { hadThinking: reasoning !== '' });
            }, function () {
                // Read aborted (overall timeout) or failed mid-stream.
                clearTimers();
                if (content === '' && reasoning === '') {
                    completeXhr(xhr, 504, JSON.stringify({ error: { message: extractErrorMessage(504, '') } }));
                    return;
                }
                // Partial content finalizes; upstream truncation-repair shows its partial hint.
                completeXhr(xhr, 200, buildChatCompletionsJson(content, reasoning));
                emit('drawio-ai-stream-done', { hadThinking: reasoning !== '', partial: true });
            });
        };
        return loop();
    }, function () {
        // fetch rejected (network error / first-byte timeout): classic fallback.
        // Route through the live outermost send so later wrappers (fence patch)
        // attach their listeners; the _aiStreamFallback flag drops the retry
        // to native send on the second pass instead of re-streaming.
        clearTimers();
        try {
            xhr._aiStreamFallback = true;
            XMLHttpRequest.prototype.send.call(xhr, originalBody);
        } catch (e) {
            completeXhr(xhr, 503, JSON.stringify({ error: { message: extractErrorMessage(503, '') } }));
        }
    });
}

export function installAiStreamPatch() {
    try {
        if (typeof Editor !== 'undefined' && Editor.prototype != null) {
            Editor.prototype.generateTimeout = OVERALL_TIMEOUT_MS;
        }
    } catch (e) { /* PostConfig retries once Editor exists */ }

    var fetchFn = null;
    try {
        fetchFn = window.fetch ? window.fetch.bind(window) : null;
    } catch (e) {
        fetchFn = null;
    }
    if (fetchFn == null || typeof TextDecoder === 'undefined' || typeof AbortController === 'undefined') return;

    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
        try {
            if (this._aiHeaders == null) this._aiHeaders = {};
            this._aiHeaders[k] = v;
        } catch (e) { /* ignore */ }
        return origSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.open = function (m, u) {
        try {
            this._aiUrl = u;
        } catch (e) { /* ignore */ }
        return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
        // Second pass after a pre-first-byte stream failure: go through the
        // current outermost send (the fence patch) so its readystatechange
        // fence-strip listener is attached, then drop to native below.
        if (this._aiStreamFallback === true) return origSend.apply(this, arguments);
        var url = null;
        try {
            url = typeof this._aiUrl === 'string' ? this._aiUrl : null;
        } catch (e) {
            url = null;
        }
        var streamBody = (url != null && typeof body === 'string' && isStreamableAiUrl(url)) ? withStreamFlag(body) : null;
        if (streamBody === null) return origSend.apply(this, arguments);
        try {
            runStream(this, url, streamBody, body, fetchFn);
        } catch (e) {
            return origSend.apply(this, arguments);
        }
    };
}
