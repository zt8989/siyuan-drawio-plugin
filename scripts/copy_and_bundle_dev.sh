#!/bin/bash

# Source and target directories
targetDir="dev"

copyItems=(
    "images/"
    "img/"
    "math/"
    "META-INF/"
    "mxgraph/"
    "plugins/"
    "resources/"
    "styles/"
    "templates/"
    # "clear.html"
    # "dropbox.html"
    # "export3.html"
    "export-fonts.css"
    "favicon.ico"
    # "github.html"
    # "gitlab.html"
    "index.html"
    # "monday-app-association.json"
    # "onedrive3.html"
    "open.html"
    "shortcuts.svg"
    "teams.html"
    "vsdxImporter.html"
)

# Remove the $targetDir/webapp directory if it exists
if [ -d "$targetDir/webapp" ]; then
    rm -rf "$targetDir/webapp"
fi

# Create the ./$targetDir directory if it doesn't exist
if [ ! -d "./$targetDir" ]; then
    mkdir -p "./$targetDir"
fi

# Create the ./$targetDir/webapp directory if it doesn't exist
if [ ! -d "./$targetDir/webapp" ]; then
    mkdir -p "./$targetDir/webapp"
fi

for item in "${copyItems[@]}"; do
    if [[ $item == *"/" ]]; then
        # Copy directory recursively
        cp -r "./drawio/src/main/webapp/$item" "./$targetDir/webapp/$item"
    else
        # Copy file
        cp "./drawio/src/main/webapp/$item" "./$targetDir/webapp/$item"
    fi
done

copyJsItems=(
    "diagramly"
    "jszip"
    "mermaid"
)

# Create the ./$targetDir/webapp/js directory if it doesn't exist
if [ ! -d "./$targetDir/webapp/js" ]; then
    mkdir -p "./$targetDir/webapp/js"
fi

excludeFiles=("integrate.min.js")  # List of files to exclude

for file in ./drawio/src/main/webapp/js/*.js; do
    fileName=$(basename "$file")
    if [[ ! " ${excludeFiles[@]} " =~ " ${fileName} " ]]; then
        cp "$file" "./$targetDir/webapp/js/$fileName"
    fi
done

# Copy all .min.js files from specific directories under "js" to the corresponding directories in the target directory
for jsItem in "${copyJsItems[@]}"; do
    # Create the ./$targetDir/webapp/js/$jsItem directory if it doesn't exist
    if [ ! -d "./$targetDir/webapp/js/$jsItem" ]; then
        mkdir -p "./$targetDir/webapp/js/$jsItem"
    fi
    for file in ./drawio/src/main/webapp/js/$jsItem/*.min.js; do
        cp "$file" "./$targetDir/webapp/js/$jsItem/"
    done
done

echo "Directory copied successfully."