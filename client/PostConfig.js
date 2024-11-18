/**
 * Copyright (c) 2006-2024, JGraph Ltd
 * Copyright (c) 2006-2024, draw.io AG
 */
// null'ing of global vars need to be after init.js
window.VSD_CONVERT_URL = null;
window.EMF_CONVERT_URL = null;
window.ICONSEARCH_PATH = null;


if(window.parent.drawioPlugin) {
    const callbacks = {}
    const typePrefix = "drawio_"
    window.addEventListener('message', function(event) {
        console.log("on drawio message", event)
        switch (event.data.type) {
            case typePrefix + "callback":
                var message = event.data;
                var messageId = message.callbackId;
                var messageArgs = message.payload;
                if(messageId && callbacks[messageId]) {
                    callbacks[messageId].apply(null, messageArgs)
                    delete callbacks[messageId]
                }
                return
        }
        
    });
    const electron = {
        sendMessage(type, payload, callbackId, callback) {
            if(callbackId) {
                callbacks[callbackId] = callback
            }
            window.parent.postMessage({
                type: typePrefix + type,
                payload,
                callbackId
            })
        }
    }
    window.parent.drawioPlugin.postConfig(window, electron)
}