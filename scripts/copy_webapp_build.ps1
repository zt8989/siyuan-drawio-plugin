# 源目录和目标目录
$targetDir = "dist"

$copyItems = @(
    "images/",
    "img/",
    "math/",
    "META-INF/",
    "mxgraph/",
    "plugins/",
    "resources/",
    "styles/",
    "templates/",
    "js/",
    # "clear.html",
    # "dropbox.html",
    # "export3.html",
    "export-fonts.css",
    "favicon.ico",
    # "github.html",
    # "gitlab.html",
    "index.html",
    # "monday-app-association.json",
    # "onedrive3.html",
    "open.html",
    "shortcuts.svg",
    "teams.html",
    "vsdxImporter.html"
)

# Remove the $targetDir/webapp directory if it exists
if (Test-Path "$targetDir/webapp") {
    Remove-Item -Path "$targetDir/webapp" -Recurse -Force
}

# Create the ./$targetDir directory if it doesn't exist
if (-not (Test-Path "./$targetDir")) {
    New-Item -Path "./$targetDir" -ItemType Directory
}

foreach ($item in $copyItems) {
    if ($item -like "*/*") {
        # Copy directory recursively
        Copy-Item -Path "./drawio/src/main/webapp/$item" -Destination "./$targetDir/webapp/$item" -Recurse
    } else {
        # Copy file
        Copy-Item -Path "./drawio/src/main/webapp/$item" -Destination "./$targetDir/webapp/$item"
    }
}

$copyJsItems = @(
    "diagramly",
    "jszip",
    "mermaid"
)

# Create the ./$targetDir/webapp directory if it doesn't exist
if (-not (Test-Path "./$targetDir/webapp/js")) {
    New-Item -Path "./$targetDir/webapp/js" -ItemType Directory
}
$excludeFiles = @("integrate.min.js")  # List of files to exclude

Get-ChildItem -Path "./drawio/src/main/webapp/js" -Filter "*.js" -Recurse -Depth 1 | ForEach-Object {
    if ($excludeFiles -notcontains $_.Name) {
        $destinationPath = $_.FullName -replace [regex]::Escape("\drawio\src\main\webapp\js"), "\$targetDir\webapp\js"
        Write-Output $destinationPath
        if ($_.FullName -ne $destinationPath) {
            Copy-Item -Path $_.FullName -Destination $destinationPath
        }
    }
}

# Copy all .min.js files from specific directories under "js" to the corresponding directories in the target directory
foreach ($jsItem in $copyJsItems) {
    # Create the ./$targetDir/webapp directory if it doesn't exist
    if (-not (Test-Path "./$targetDir/webapp/js/$jsItem")) {
        New-Item -Path "./$targetDir/webapp/js/$jsItem" -ItemType Directory
    }
    Get-ChildItem -Path "./drawio/src/main/webapp/js/$jsItem" -Filter "*.min.js" | ForEach-Object {
        $destinationPath = $_.FullName -replace [regex]::Escape("\drawio\src\main\webapp\js\$jsItem"), "\$targetDir\webapp\js\$jsItem"
        Write-Output $destinationPath
        if ($_.FullName -ne $destinationPath) {
            Copy-Item -Path $_.FullName -Destination $destinationPath
        }
    }
}

Write-Output "Directory copied successfully."