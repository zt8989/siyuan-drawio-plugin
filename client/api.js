// 生成思源 ID 的函数
function generateSiyuanId() {
    const now = new Date();

    // 生成时间戳部分 YYYYMMDDHHMMSS
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;

    // 生成 7 位随机字母
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    let random = '';
    for (let i = 0; i < 7; i++) {
        random += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    return `${timestamp}-${random}`;
}

// 检查并转换文件名的函数
export function formatFileName(input, pathPrefix) {
    if(pathPrefix.startsWith("/data/assets")) {
        return input
    }

    const regex = /^[^-\s]+-\d{14}-[a-zA-Z0-9]{7}\.[a-zA-Z0-9]+$/;

    if (!regex.test(input)) {
        // 如果不匹配，则插入 generateSiyuanId 生成的字符串
        const parts = input.split('.');
        if (parts.length === 2) {
            const [name, extension] = parts;
            return `${name}-${generateSiyuanId()}.${extension}`;
        }
    }

    // 如果已经匹配，直接返回原字符串
    return input;
}