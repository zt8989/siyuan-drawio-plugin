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

Write-Output "Directory copied successfully."