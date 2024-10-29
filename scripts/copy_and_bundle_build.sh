#!/bin/bash

# Default behavior is to create a zip file
createZip=true

# Check if the environment variable ENV is set and if bundle is 0
if [ -n "$BUNDLE" ] && [ "$BUNDLE" == "0" ]; then
    createZip=false
else
    createZip=true
fi

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

# Create a zip file if the flag is not set to false
if [ "$createZip" = true ]; then
    (cd "$outputDir" && zip -FSr "../$zipFilePath" *)
    echo "Zip file created successfully."
else
    echo "Directory copied successfully. No zip file created."
fi
