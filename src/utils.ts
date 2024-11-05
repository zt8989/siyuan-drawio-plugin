const InvalidPathChar = [
    "\\",
    "/",
    ":",
    "*",
    "?",
    '"',
    "<",
    ">",
    "|",
    "$",
    "&",
    "^",
    ".",
  ];

export function checkInvalidPathChar(result: string){
    return InvalidPathChar.some((v) => result.indexOf(v) !== -1)
}

// Function to get the iframe element from the event source
export function getIframeFromEventSource(source: Window) {
    var iframes = document.querySelectorAll('iframe');
    for (var i = 0; i < iframes.length; i++) {
        if (iframes[i].contentWindow === source) {
            return iframes[i];
        }
    }
    return null;
}