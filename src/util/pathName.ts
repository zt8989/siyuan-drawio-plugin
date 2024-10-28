import * as path from "path";

export const pathPosix = () => {
    if (path.posix) {
        return path.posix;
    }
    return path;
};