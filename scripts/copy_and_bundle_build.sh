#!/bin/bash

# Define source and destination directories
outputDir="dist"
webappJsDir="$outputDir/webapp/js"
webappDir="$outputDir/webapp"
zipFilePath="package.zip"

# Define the list of files to copy
filesToCopy=(
    "$outputDir/PostConfig.js:$webappJsDir"
    "$outputDir/PreConfig.js:$webappJsDir"
    "$outputDir/service-worker.js:$webappDir"
)

# Create destination directories if they don't exist
mkdir -p "$webappJsDir" "$webappDir"

# Copy files
for file in "${filesToCopy[@]}"; do
    src="${file%%:*}"
    dest="${file##*:}"

    if [ -f "$src" ]; then
        mv "$src" "$dest"
        echo "Moved $src to $dest"
    else
        echo "Source file not found: $src"
    fi
done

# Compress the contents of the directory, excluding the dist directory itself
(cd "$outputDir" && zip -FSr "../$zipFilePath" *)