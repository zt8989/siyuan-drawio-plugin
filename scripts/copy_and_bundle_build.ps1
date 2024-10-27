# 定义源目录和目标目录
$outputDir = "dist"
$webappJsDir = Join-Path -Path $outputDir -ChildPath "webapp\js"
$webappDir = Join-Path -Path $outputDir -ChildPath "webapp"
$zipFilePath = "package.zip"

# 定义要复制的文件列表
$filesToCopy = @(
    @{ src = Join-Path -Path $outputDir -ChildPath "PostConfig.js"; dest = $webappJsDir },
    @{ src = Join-Path -Path $outputDir -ChildPath "PreConfig.js"; dest = $webappJsDir },
    @{ src = Join-Path -Path $outputDir -ChildPath "service-worker.js"; dest = $webappDir }
)

# 复制文件
foreach ($file in $filesToCopy) {
    $src = $file.src
    $dest = $file.dest

    if (Test-Path -Path $src) {
        Move-Item -Path $src -Destination $dest -Verbose -Force
    } else {
        Write-Host "Source file not found: $src" -ForegroundColor Red
    }
}

# 压缩目录中的内容，不包含 dist 目录本身
Compress-Archive -Path "$outputDir/*" -DestinationPath $zipFilePath -Force 