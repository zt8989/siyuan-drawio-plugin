import { logger } from "./logger";
const typePrefix = "drawio_"

class DefaultElectronImpl {

    constructor() {
        this.callbacks = {}
        //#region public method
        window.addEventListener('message', (event) => {
            // Only process messages from same origin
            if (event.origin !== window.location.origin) {
                logger.debug('Rejected message from invalid origin:', event.origin);
                return;
            }

            logger.debug('Received message:', event.data, event.payload);
            switch (event.data.type) {
                case typePrefix + "callback":
                    var message = event.data;
                    var messageId = message.callbackId;
                    var messageArgs = message.payload;
                    if(messageId && this.callbacks[messageId]) {
                        this.callbacks[messageId].apply(null, messageArgs)
                        delete this.callbacks[messageId]
                    }
                    return
            }
            
        });
    }
    

    sendMessage(type, payload, callbackId, callback) {
        if(callbackId) {
            this.callbacks[callbackId] = callback
        }
        logger.debug('sendMessage:', type, payload);
        window.parent.postMessage({
            type: typePrefix + type,
            payload,
            callbackId
        })
    }
}

class NoopElectronImpl {
    sendMessage(type, payload, callbackId, callback) {
    }
}

export { NoopElectronImpl, DefaultElectronImpl }