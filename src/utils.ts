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

export function trim(str: string) {
    return String.prototype.trim.apply(undefined, str)
}