// const fs = require('fs');
// const path = require('path');
// const readline = require('readline');
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { exec } from 'node:child_process';
import { version } from 'node:os';

// Utility to read JSON file
function readJsonFile(filePath) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) return reject(err);
            try {
                const jsonData = JSON.parse(data);
                resolve(jsonData);
            } catch (e) {
                reject(e);
            }
        });
    });
}

// Utility to write JSON file
function writeJsonFile(filePath, jsonData) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), 'utf8', (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

// Utility to prompt the user for input
function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
    }));
}

// Function to parse the version string
function parseVersion(version) {
    const [major, minor, patch] = version.split('.').map(Number);
    return { major, minor, patch };
}

// Function to auto-increment version parts
function incrementVersion(version, type) {
    let { major, minor, patch } = parseVersion(version);

    switch (type) {
        case 'major':
            major++;
            minor = 0;
            patch = 0;
            break;
        case 'minor':
            minor++;
            patch = 0;
            break;
        case 'patch':
            patch++;
            break;
        default:
            break;
    }

    return `${major}.${minor}.${patch}`;
}

// Function to execute a shell command
function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

// Main script
(async function () {
    try {
        const pluginJsonPath = path.join(process.cwd(), 'plugin.json');
        const packageJsonPath = path.join(process.cwd(), 'package.json');

        // Read both JSON files
        const pluginData = await readJsonFile(pluginJsonPath);
        const packageData = await readJsonFile(packageJsonPath);

        // Get the current version from both files (assuming both have the same version)
        const currentVersion = pluginData.version || packageData.version;
        console.log(`\n🌟  Current version: \x1b[36m${currentVersion}\x1b[0m\n`);

        // Calculate potential new versions for auto-update
        const newPatchVersion = incrementVersion(currentVersion, 'patch');
        const newMinorVersion = incrementVersion(currentVersion, 'minor');
        const newMajorVersion = incrementVersion(currentVersion, 'major');

        // Prompt the user with formatted options
        console.log('🔄  How would you like to update the version?\n');
        console.log(`   1️⃣  Auto update \x1b[33mpatch\x1b[0m version   (new version: \x1b[32m${newPatchVersion}\x1b[0m)`);
        console.log(`   2️⃣  Auto update \x1b[33mminor\x1b[0m version   (new version: \x1b[32m${newMinorVersion}\x1b[0m)`);
        console.log(`   3️⃣  Auto update \x1b[33mmajor\x1b[0m version   (new version: \x1b[32m${newMajorVersion}\x1b[0m)`);
        console.log(`   4️⃣  Input version \x1b[33mmanually\x1b[0m`);
        // Press 0 to skip version update
        console.log('   0️⃣  Quit without updating\n');

        const updateChoice = await promptUser('👉  Please choose (1/2/3/4): ');

        let newVersion;

        switch (updateChoice.trim()) {
            case '1':
                newVersion = newPatchVersion;
                break;
            case '2':
                newVersion = newMinorVersion;
                break;
            case '3':
                newVersion = newMajorVersion;
                break;
            case '4':
                newVersion = await promptUser('✍️  Please enter the new version (in a.b.c format): ');
                break;
            case '0':
                console.log('\n🛑  Skipping version update.');
                return;
            default:
                console.log('\n❌  Invalid option, no version update.');
                return;
        }

        // Update the version in both plugin.json and package.json
        pluginData.version = newVersion;
        packageData.version = newVersion;

        // Write the updated JSON back to files
        await writeJsonFile(pluginJsonPath, pluginData);
        await writeJsonFile(packageJsonPath, packageData);

        // Update the version in the markdown files
        const readmePath = path.join(process.cwd(), 'README.md');
        const readmeZhPath = path.join(process.cwd(), 'README_zh_CN.md');

        const updateMarkdownVersion = async (filePath, versionHeading) => {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const updatedContent = content.replace(new RegExp(`${versionHeading}\\n\\d+\\.\\d+\\.\\d+`, 'g'), `${versionHeading}\n${newVersion}`);
            await fs.promises.writeFile(filePath, updatedContent, 'utf8');
        };

        await updateMarkdownVersion(readmePath, '## Version');
        await updateMarkdownVersion(readmeZhPath, '## 版本');

        console.log(`\n✅  Version successfully updated to: \x1b[32m${newVersion}\x1b[0m\n`);

        // Perform git add and git push
        console.log('🔄  Performing git add and git push...');
        await executeCommand('git add plugin.json package.json README.md README_zh_CN.md');
        await executeCommand(`git commit -m "chore: bump version to ${newVersion}"`);
        await executeCommand(`git push`);

        // Create and push git tag
        console.log('🔄  Creating and pushing git tag...');
        await executeCommand(`git tag v${newVersion}`);
        await executeCommand(`git push origin v${newVersion}`);

        console.log('✅  Git add and push completed.');

    } catch (error) {
        console.error('❌  Error:', error);
    }
})();
