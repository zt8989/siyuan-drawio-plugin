export const focusByRange = (range: Range) => {
    if (!range) {
        return;
    }

    const startNode = range.startContainer.childNodes[range.startOffset] as HTMLElement;
    if (startNode && startNode.nodeType !== 3 && ["INPUT", "TEXTAREA"].includes(startNode.tagName)) {
        startNode.focus();
        return;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
};