import fs from 'fs';
import path from 'path';  
import {rimraf} from 'rimraf';

const targetDir = process.argv[2] || 'dist';

const copyItems = [
    "images/",
    "img/",
    "math/",
    "META-INF/",
    "mxgraph/",
    "plugins/",
    "resources/",
    "styles/",
    "templates/",
    "export-fonts.css",
    "favicon.ico",
    "index.html",
    "open.html",
    "shortcuts.svg",
    "teams.html",
    "vsdxImporter.html",
];

const copyJsItems = [
    "diagramly",
    "jszip",
    "mermaid",
];

const excludeFiles = [
    "integrate.min.js",
];

function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function copyFile(src, dest) {
    fs.copyFileSync(src, dest);
}

function copyDirectory(src, dest, exclude = []) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const files = fs.readdirSync(src);
    files.forEach(file => {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        if (fs.lstatSync(srcPath).isDirectory()) {
            if (!exclude.includes(file)) {
                copyDirectory(srcPath, destPath);
            }
        } else {
            copyFile(srcPath, destPath);
        }
    });
}

// Remove the $targetDir/webapp directory if it exists
const webappDir = path.join(targetDir, 'webapp');
if (fs.existsSync(webappDir)) {
    rimraf.sync(webappDir);
}

// Create the ./$targetDir directory if it doesn't exist
ensureDirectoryExists(targetDir);

// Create the ./$targetDir/webapp directory if it doesn't exist
ensureDirectoryExists(webappDir);

// Copy items
copyItems.forEach(item => {
    const srcPath = path.join('drawio/src/main/webapp', item);
    const destPath = path.join(webappDir, item);
    if (item.endsWith('/')) {
        if (item === 'mxgraph/') {
            copyDirectory(srcPath, destPath, ['src']);
        } else {
            copyDirectory(srcPath, destPath);
        }
    } else {
        copyFile(srcPath, destPath);
    }
});

// Create the ./$targetDir/webapp/js directory if it doesn't exist
const jsDir = path.join(webappDir, 'js');
ensureDirectoryExists(jsDir);

// Copy .js files excluding specific ones
const jsFiles = fs.readdirSync(path.join('drawio/src/main/webapp/js')).filter(file => file.endsWith('.js'));
jsFiles.forEach(file => {
    if (!excludeFiles.includes(file)) {
        copyFile(path.join('drawio/src/main/webapp/js', file), path.join(jsDir, file));
    }
});

// Copy .min.js files from specific directories under "js"
copyJsItems.forEach(jsItem => {
    const srcDir = path.join('drawio/src/main/webapp/js', jsItem);
    const destDir = path.join(jsDir, jsItem);
    ensureDirectoryExists(destDir);
    const minJsFiles = fs.readdirSync(srcDir).filter(file => file.endsWith('.min.js'));
    minJsFiles.forEach(file => {
        copyFile(path.join(srcDir, file), path.join(destDir, file));
    });
});

console.log('Directory copied successfully.');