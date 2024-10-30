import * as path from "path-browserify";

export const pathPosix = () => {
    if (path.posix) {
        return path.posix;
    }
    return path;
};