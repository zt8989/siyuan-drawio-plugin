# 源目录和目标目录
$sourceDir = "drawio\src\main\webapp"
$targetDir = "dev"

# 检查目标目录是否存在，如果不存在则创建
if (-Not (Test-Path -Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir
}

# 使用 Copy-Item 递归复制目录
Copy-Item -Path $sourceDir -Destination $targetDir -Recurse -Force

Write-Output "Directory copied successfully."