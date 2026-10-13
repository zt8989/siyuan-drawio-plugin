/**
 * pdfExportPageBridge — the `window.electron` surface the upstream drawio export page
 * (js/export.js) expects, wired to the plugin host instead of the drawio desktop main
 * process (issue #75).
 *
 * The host creates the hidden window for us, so the only thing this bridge cannot know is
 * when to render and where to send the result. Both go over a same-origin BroadcastChannel:
 *
 *   page  -> host   { action: 'ready' }                     (export.js is listening)
 *   host  -> page   { action: 'render', payload: args }     (draw.io export parameters)
 *   page  -> host   { action: 'render-finished', payload }  (bounds/pageCount, null on error)
 *   page  -> host   { action: 'export-error', payload }     (message)
 *
 * The host prints this window with printToPDF and closes it; the page never saves anything.
 */
(function () {
    var CHANNEL_NAME = 'siyuan-drawio-pdf-export';
    var channel = new BroadcastChannel(CHANNEL_NAME);
    var listeners = {};
    var renderStarted = false;

    function post(action, payload) {
        channel.postMessage({ action: action, payload: payload });
    }

    window.electron = {
        sendMessage: function (action, args) {
            if (action === 'render-finished') {
                post('render-finished', args);
            } else if (action === 'export-error') {
                post('export-error', args);
            } else {
                // svg-data / xml-data belong to the non-PDF formats, which this page never renders.
                post(action, args);
            }
        },
        // Only the PDF path is wired up here; upstream registers listeners, it never uses these two.
        listenOnce: function () {},
        request: function () {
            throw new Error('pdfExportPageBridge: request() is not available in the PDF export window');
        },
        registerMsgListener: function (action, callback) {
            listeners[action] = callback;

            // export.js registers 'render' at the end of its own load *and* buffers a request that
            // arrives while the shapes are still loading, so this is the earliest safe moment to
            // tell the host to send the diagram.
            if (action === 'render') {
                post('ready', null);
            }
        },
    };

    channel.addEventListener('message', function (event) {
        var data = event.data || {};

        if (data.action !== 'render' || renderStarted) {
            return;
        }

        var callback = listeners['render'];

        if (typeof callback === 'function') {
            renderStarted = true;
            callback(data.payload);
        }
    });

    channel.addEventListener('messageerror', function () {
        post('export-error', 'PDF 导出页无法解析宿主消息');
    });
})();