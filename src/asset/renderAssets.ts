import {Constants} from "@/constants";
import {pathPosix} from "@/util/pathName";
import { getTitleFromPath } from "@/link";
import { IProtyle } from "siyuan";
import { generateSiyuanIdPrefix } from "@/api";
import { DrawioAsset } from "./DrawioAsset";

export const renderAssetsPreview = (pathString: string) => {
    if (!pathString) {
        return "";
    }
    const type = pathPosix().extname(pathString).toLowerCase();
    if (Constants.SIYUAN_ASSETS_IMAGE.includes(type)) {
        return `<img style="max-height: 100%" src="${pathString}">`;
    } else if (Constants.SIYUAN_ASSETS_AUDIO.includes(type)) {
        return `<audio style="max-width: 100%" controls="controls" src="${pathString}"></audio>`;
    } else if (Constants.SIYUAN_ASSETS_VIDEO.includes(type)) {
        return `<video style="max-width: 100%" controls="controls" src="${pathString}"></video>`;
    } else {
        return pathString;
    }
};

export const genDrawioHTMLByUrl = (assetUrl: string)  => {
    const title = getTitleFromPath(assetUrl)
    const id = title.includes("-") ? (DrawioAsset.extractId(title.split(".")[0]) || "") : "";
    return genDrawioIFrameHTML(assetUrl, getDrawioIframe(title, assetUrl), id || generateSiyuanIdPrefix())
}

export const getDrawioIframe = (title: string, assetUrl: string) => {
    const urlSearchParams = new URLSearchParams("?tags=%7B%7D&lightbox=1&highlight=0000ff&edit=_blank&layers=1&")
    urlSearchParams.append('toolbar-config', JSON.stringify({
        refreshBtn: {}
    }))
    urlSearchParams.append('title', title)
    return `/plugins/siyuan-drawio-plugin/webapp/?${urlSearchParams.toString()}#U${encodeURIComponent(assetUrl)}`
}


// Contract: extractId/formatDate removed — single source of truth is DrawioAsset.extractId / DrawioAsset.generateId
// Deleted formatDate and extractId wrappers (old shallow helpers) — callers now use DrawioAsset directly

export const genDrawioIFrameHTML = (assetUrl: string, iframeSrc: string, id: string, width = "100%", height = "200px") => {
    const html = `<iframe frameborder="0" style="width:${width};height:${height};" src="${iframeSrc}"></iframe>`
    const meta = `{: id="${id}" custom-data-assets="${assetUrl}" }`
    return html + "\n" + meta
};

export const genDrawioEmbedHTML = (assetUrl: string, iframeSrc: string, protyle: IProtyle, width = "100%", height = "200px") => {
    const tempElement = document.createElement("template");
    const html = `<iframe frameborder="0" style="width:${width};height:${height};" src="/plugins/siyuan-drawio-plugin/webapp/embed.html"></iframe>`
    tempElement.innerHTML = protyle.lute.SpinBlockDOM(html)
    const nodeIFrame = tempElement.content.querySelector(`div[data-type="NodeIFrame"]`)
    nodeIFrame?.setAttribute('custom-data-assets', assetUrl);
    return protyle.lute.SpinBlockDOM(tempElement.innerHTML)
};

