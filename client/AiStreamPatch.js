import {
    FIRST_BYTE_TIMEOUT_MS,
    OVERALL_TIMEOUT_MS,
    buildChatCompletionsJson,
    extractClassicContent,
    extractDelta,
    extractErrorMessage,
    formatThinkingPreview,
    formatThinkingText,
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
var THINK_ROW_ATTR = 'data-siyuan-ai-think';
var streamSeq = 0;
// Full reasoning per row (collapsed preview can't hold it); WeakMap so
// detached rows never leak.
var thinkFullTexts = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

function setThinkCollapsedStyle(row) {
    // Single line with ellipsis: the preview text is already
    // truncated, the row itself must never wrap into a cut-off
    // second line inside the narrow chat bubble.
    row.style.whiteSpace = 'nowrap';
    row.style.overflow = 'hidden';
    row.style.textOverflow = 'ellipsis';
    row.style.maxWidth = '100%';
    row.style.maxHeight = '';
}

function setThinkExpandedStyle(row) {
    row.style.whiteSpace = 'pre-wrap';
    row.style.overflow = 'auto';
    row.style.maxWidth = '100%';
    row.style.maxHeight = '240px';
}

function rememberThinkFull(row, full) {
    try {
        if (thinkFullTexts) thinkFullTexts.set(row, full);
        else row.setAttribute('data-siyuan-ai-think-full', full);
    } catch (e) { /* ignore */ }
}

function recallThinkFull(row) {
    try {
        if (thinkFullTexts) {
            var v = thinkFullTexts.get(row);
            if (typeof v === 'string') return v;
        }
        return row.getAttribute('data-siyuan-ai-think-full') || '';
    } catch (e) {
        return '';
    }
}

function paintThinkRow(row, state, preview) {
    try {
        row.dataset.thinkState = state;
        row.textContent = formatThinkingText(state, preview);
    } catch (e) { /* never break the stream on UI errors */ }
}

function findThinkRow(waiting) {
    try {
        if (waiting == null) return null;
        var prev = waiting.previousElementSibling;
        if (prev != null && prev.hasAttribute && prev.hasAttribute(THINK_ROW_ATTR)) return prev;
    } catch (e) { /* ignore */ }
    return null;
}

// The thinking row lives as the waiting bubble's previous sibling so the
// upstream final render (target.innerHTML = '') can't wipe it; it persists
// across the exchange and flips 思考中 -> 思考 on completion. Click toggles
// collapsed preview <-> full reasoning. streamId separates a continuing
// stream (preserve expanded, keep tailing) from a retry/new stream (reset).
function ensureThinkRow(waiting, streamId) {
    var row = findThinkRow(waiting);
    if (row != null) {
        try {
            if (row.dataset.streamId !== String(streamId)) {
                row.dataset.streamId = String(streamId);
                row.dataset.expanded = '';
                row.dataset.thinkState = 'streaming';
                setThinkCollapsedStyle(row);
            }
        } catch (e) { /* ignore */ }
        return row;
    }
    if (waiting == null || waiting.parentNode == null) return null;
    try {
        row = document.createElement('div');
        row.setAttribute(THINK_ROW_ATTR, '1');
        row.dataset.streamId = String(streamId);
        row.dataset.expanded = '';
        row.dataset.thinkState = 'streaming';
        row.style.color = '#888';
        row.style.fontSize = '12px';
        row.style.cursor = 'pointer';
        row.title = '点击展开/收起思考过程';
        setThinkCollapsedStyle(row);
        row.addEventListener('click', function () {
            try {
                var full = recallThinkFull(row);
                if (full === '') return;
                if (row.dataset.expanded === '1') {
                    row.dataset.expanded = '';
                    setThinkCollapsedStyle(row);
                    paintThinkRow(row, row.dataset.thinkState === 'done' ? 'done' : 'streaming', formatThinkingPreview(full));
                } else {
                    row.dataset.expanded = '1';
                    setThinkExpandedStyle(row);
                    row.textContent = formatThinkingText(row.dataset.thinkState === 'done' ? 'done' : 'streaming', '') + '\n' + full;
                }
            } catch (e) { /* ignore */ }
        });
        waiting.parentNode.insertBefore(row, waiting);
        return row;
    } catch (e) {
        return null;
    }
}

// Finalizes the persistent row: done label, or removal when nothing was
// ever thought (keeps "no thinking -> no row"). An expanded row stays
// expanded, only the label flips.
function finalizeThinkRow(waiting, reasoning) {
    var row = findThinkRow(waiting);
    if (row == null) return;
    try {
        if (reasoning === '') {
            if (row.parentNode) row.parentNode.removeChild(row);
            return;
        }
        rememberThinkFull(row, reasoning);
        if (row.dataset.expanded === '1') {
            row.dataset.thinkState = 'done';
            setThinkExpandedStyle(row);
            row.textContent = formatThinkingText('done', '') + '\n' + reasoning;
            row.scrollTop = row.scrollHeight;
        } else {
            setThinkCollapsedStyle(row);
            paintThinkRow(row, 'done', formatThinkingPreview(reasoning));
        }
    } catch (e) { /* ignore */ }
}

function emit(name, detail) {
    // Observability hook for e2e (and debugging): thinking progress and
    // completion are visible even when the stream resolves in one read.
    try {
        window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (e) { /* ignore */ }
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

function renderProgress(waiting, reasoning, content, streamId) {
    if (waiting == null || waiting.parentNode == null) return;
    if (reasoning === '' && content === '') return;
    try {
        waiting.innerHTML = '';
        if (reasoning !== '') {
            var preview = formatThinkingPreview(reasoning);
            var thinkRow = ensureThinkRow(waiting, streamId);
            if (thinkRow != null) {
                rememberThinkFull(thinkRow, reasoning);
                if (thinkRow.dataset.expanded === '1') {
                    // Expanded stays expanded across refreshes: keep tailing
                    // the scrollable full text instead of collapsing.
                    setThinkExpandedStyle(thinkRow);
                    thinkRow.textContent = formatThinkingText('streaming', '') + '\n' + reasoning;
                    thinkRow.scrollTop = thinkRow.scrollHeight;
                } else {
                    paintThinkRow(thinkRow, 'streaming', preview);
                }
            }
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
        var streamId = ++streamSeq;

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
                        renderProgress(waiting, reasoning, content, streamId);
                        return false;
                    }
                }
                renderProgress(waiting, reasoning, content, streamId);
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
                finalizeThinkRow(waiting, reasoning);
                emit('drawio-ai-stream-done', { hadThinking: reasoning !== '', contentLength: content.length });
            }, function () {
                // Read aborted (overall timeout) or failed mid-stream.
                clearTimers();
                if (content === '' && reasoning === '') {
                    finalizeThinkRow(waiting, reasoning);
                    completeXhr(xhr, 504, JSON.stringify({ error: { message: extractErrorMessage(504, '') } }));
                    return;
                }
                // Partial content finalizes; upstream truncation-repair shows its partial hint.
                completeXhr(xhr, 200, buildChatCompletionsJson(content, reasoning));
                finalizeThinkRow(waiting, reasoning);
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
