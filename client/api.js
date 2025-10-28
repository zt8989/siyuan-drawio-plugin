// 生成思源 ID 的函数
export function generateSiyuanId() {
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
    // 将输入按点拆分
    const parts = input.split('.');
    let extension = parts.pop(); // 获取最后一部分作为扩展名
    if(parts[parts.length - 1] == "drawio") {
        extension = "drawio." + extension;
        parts.pop();
    }
    const name = parts.join('.'); // 其余部分作为文件名
    
    // 定义文件名部分的正则表达式
    const nameRegex = /^.+-\d{14}-[a-zA-Z0-9]{7}$/;
    
    // 检查文件名部分是否符合要求
    if (!nameRegex.test(name)) {
        // 如果不匹配，则插入 generateSiyuanId 生成的字符串
        return `${name}-${generateSiyuanId()}.${extension}`;
    }
    
    // 如果已经匹配，直接返回原字符串
    return input;
}