export function getTitleFromPath(path: string, withExtension: boolean = true) {
    const items = path.split("/")
    const title = items[items.length - 1]
    if (withExtension) {
        return title
    } else {
        const items = title.split(".")
        return items[0]
    }
}

export function getFileName(fileName: string) {
    const items = fileName.split(".")
    return items[0]
}

export function createLink(title: string, path: string){
    var urlParams = new URLSearchParams({
        icon: "iconDrawio",
        title: title,
        data: JSON.stringify({ url: path })
    })
    var link = `[${title}](siyuan://plugins/siyuan-drawio-plugin?${urlParams.toString()})`
    return link
}

export function createLinkFromPath(path: string){
    const title = getTitleFromPath(path)
    return createLink(title, path)
}

export function createUrlFromTitle(title: string) {
    return 'storage/petal/siyuan-drawio-plugin/' + title
}

export function createLinkFromTitle(title: string){
    const path = createUrlFromTitle(title)
    return createLink(title, path)
}