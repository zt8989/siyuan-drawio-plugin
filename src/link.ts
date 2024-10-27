export function getTitleFromPath(path: string) {
    const items = path.split("/")
    const title = items[items.length - 1]
    return title
}

export function createLink(path: string){
    const title = getTitleFromPath(path)
    var urlParams = new URLSearchParams({
        icon: "iconDrawio",
        title: title,
        data: JSON.stringify({ url: path })
    })
    var link = `[${title}](siyuan://plugins/siyuan-drawio-plugin?${urlParams.toString()})`
    return link
}