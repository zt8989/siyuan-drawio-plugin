# 定义源目录和目标目录
$outputDir = "dev"
$webappJsDir = Join-Path -Path $outputDir -ChildPath "webapp\js"
$webappDir = Join-Path -Path $outputDir -ChildPath "webapp"

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
        Copy-Item -Path $src -Destination $dest -Verbose -Force
    } else {
        Write-Host "Source file not found: $src" -ForegroundColor Red
    }
}