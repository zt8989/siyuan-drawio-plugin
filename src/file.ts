import { xml } from "./constants";

export function saveContentAsFile(title: string, content: string, mimeType = xml){
    const blob = new Blob([content], { type: mimeType });
    const file = new File([blob], title, { type: mimeType });
    return file
}