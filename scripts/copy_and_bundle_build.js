import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
import JSZip from 'jszip';


const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outputDir = process.argv[2] || 'dist';
const createZip = process.env.BUNDLE !== '0' && outputDir === 'dist';
const webappJsDir = path.join(outputDir, 'webapp', 'js');
const webappDir = path.join(outputDir, 'webapp');
const zipFilePath = 'package.zip';

const filesToCopy = [
    // PreConfig/PostConfig are now built directly to webapp/js via vite.client.config.ts as IIFE with correct sourcemap.
    // Do not move/wrap here – just ensure embed files are copied (client config also does, but keep for safety).
    { src: path.join("client", 'embed.html'), dest: webappDir, type: "copy" },
    { src: path.join("client", 'embed2.js'), dest: webappDir, type: "copy" },
];

// Create destination directories if they don't exist
if (!fs.existsSync(webappJsDir)) {
    fs.mkdirSync(webappJsDir, { recursive: true });
}
if (!fs.existsSync(webappDir)) {
    fs.mkdirSync(webappDir, { recursive: true });
}

// Copy files
filesToCopy.forEach(({ src, dest, type }) => {
    if(type == "move") {
        if (fs.existsSync(src)) {
            const destFile = path.join(dest, path.basename(src));
            fs.renameSync(src, destFile);
            console.log(`Moved ${src} to ${destFile}`);
        } else {
            console.log(`Source file not found: ${src}`);
        }
    } 
    if(type == "copy") {
        if (fs.existsSync(src)) {
            const destFile = path.join(dest, path.basename(src));
            fs.copyFileSync(src, destFile);
            console.log(`Copied ${src} to ${destFile}`);
        } else {
            console.log(`Source file not found: ${src}`);
        }
    }
    if(type == "moveAndiife") {
        if (fs.existsSync(src)) {
            const destFile = path.join(dest, path.basename(src));
            if (fs.existsSync(destFile)) {
                // New vite.client.config already outputs IIFE with correct sourcemap to webapp/js
                // Don't overwrite – just remove the leftover in outputDir
                fs.unlinkSync(src);
                console.log(`Removed leftover ${src} (already built at ${destFile})`);
            } else {
                // Fallback for old single-config build: wrap manually
                const fileContent = fs.readFileSync(src, 'utf8');
                const wrappedContent = `(function() {\n${fileContent}\n})();`;
                fs.writeFileSync(destFile, wrappedContent);
                fs.unlinkSync(src);
                console.log(`Moved and wrapped with IIFE: ${src} to ${destFile}`);
            }
        } else {
            // No legacy file, check if new client build already produced the file
            const destFile = path.join(dest, path.basename(src));
            if (fs.existsSync(destFile)) {
                console.log(`Skipped ${src} -> ${destFile} (already exists via vite.client.config)`);
            } else {
                console.log(`Source file not found: ${src}`);
            }
        }
    }
})

// Create a zip file if the flag is not set to false
if (createZip) {
    const zip = new JSZip();
    const files = fs.readdirSync(outputDir);

    function addFolderToZip(folderPath, zip) {
        const files = fs.readdirSync(folderPath);
        files.forEach(file => {
            const filePath = path.join(folderPath, file);
            const relativePath = path.relative(outputDir, filePath);
            if (fs.statSync(filePath).isFile()) {
                const fileContent = fs.readFileSync(filePath);
                zip.file(relativePath, fileContent);
            } else if (fs.statSync(filePath).isDirectory()) {
                addFolderToZip(filePath, zip);
            }
        });
    }

    files.forEach(file => {
        const filePath = path.join(outputDir, file);
        if (fs.statSync(filePath).isFile()) {
            const fileContent = fs.readFileSync(filePath);
            zip.file(file, fileContent);
        } else if (fs.statSync(filePath).isDirectory()) {
            addFolderToZip(filePath, zip);
        }
    });

    zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } }).then(content => {
        fs.writeFileSync(zipFilePath, content);
        console.log('Zip file created successfully.');
    });
} else {
    console.log('Directory copied successfully. No zip file created.');
}