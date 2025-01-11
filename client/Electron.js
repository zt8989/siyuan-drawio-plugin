const typePrefix = "drawio_"

class DefaultElectronImpl {
    callbacks = {}

    constructor() {
        //#region public method
        window.addEventListener('message', function(event) {
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
            callbacks[callbackId] = callback
        }
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