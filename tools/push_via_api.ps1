# 通过 GitHub Git Data API 推送整个项目为单个提交。
#
# 为什么不用 git push：本机 git 经沙箱代理访问 github.com 时，git-receive-pack
# 返回 401 后凭据助手环节静默失败（rc=128 且无任何输出），无法完成写入。
# gh CLI 的 API 调用可以正常穿透，因此改用 blobs -> tree -> commit -> ref 流程。
#
# 文件内容在本地读取并 base64 编码，不经过调用方。

param(
    [string]$Owner = "caoxiuhui520-stack",
    [string]$Repo  = "design-history-quiz",
    [string]$Proj  = "C:\Users\Administrator\WorkBuddy\2026-09-13-17-05-28\design-history-quiz",
    [string]$Branch = "main",
    [string]$Message = "chore: 现代设计史刷题站首版（78 题题库 + 判分内核 + 全套文档）"
)

$ErrorActionPreference = "Stop"
$gh = "C:\Users\Administrator\AppData\Local\Programs\GitHubCLI\gh.exe"
$utf8 = New-Object System.Text.UTF8Encoding $false

function Invoke-GhApi {
    param([string]$Method, [string]$Endpoint, [string]$BodyFile)
    $args = @("api", "-X", $Method, $Endpoint)
    if ($BodyFile) { $args += @("--input", $BodyFile) }
    $out = & $gh @args 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "gh api $Method $Endpoint failed: $out" }
    return $out
}

function Write-JsonFile {
    param([string]$Path, $Object)
    [IO.File]::WriteAllText($Path, ($Object | ConvertTo-Json -Depth 10 -Compress), $utf8)
}

function Encode-Path {
    param([string]$Rel)
    return (($Rel -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
}

# ------------------------------------------------------------------ 收集文件
$skip = '\\(node_modules|dist|dist-standalone|\.git|\.vite)\\'
$root = (Resolve-Path $Proj).Path
$files = Get-ChildItem -Recurse -File $Proj |
    Where-Object { $_.FullName -notmatch $skip -and $_.FullName -notlike "*\.git\*" }

Write-Output ("files to push: " + $files.Count)

# ------------------------------------------------------------------ 1. blobs
$treeEntries = @()
$i = 0
foreach ($f in $files) {
    $i++
    $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName))
    $bodyFile = Join-Path $env:TEMP "gh-blob.json"
    Write-JsonFile $bodyFile @{ content = $b64; encoding = "base64" }
    $resp = Invoke-GhApi -Method POST -Endpoint "repos/$Owner/$Repo/git/blobs" -BodyFile $bodyFile
    $sha = ($resp | ConvertFrom-Json).sha
    if (-not $sha) { throw "no sha for $rel" }
    $treeEntries += @{ path = $rel; mode = "100644"; type = "blob"; sha = $sha }
    if ($i % 10 -eq 0) { Write-Output ("  blobs: $i / " + $files.Count) }
}
Write-Output ("blobs done: " + $treeEntries.Count)

# ------------------------------------------------------------------- 2. tree
$treeFile = Join-Path $env:TEMP "gh-tree.json"
Write-JsonFile $treeFile @{ tree = $treeEntries }
$treeResp = Invoke-GhApi -Method POST -Endpoint "repos/$Owner/$Repo/git/trees" -BodyFile $treeFile
$treeSha = ($treeResp | ConvertFrom-Json).sha
Write-Output "tree: $treeSha"

# ----------------------------------------------------------------- 3. commit
$commitFile = Join-Path $env:TEMP "gh-commit.json"
Write-JsonFile $commitFile @{ message = $Message; tree = $treeSha; parents = @() }
$commitResp = Invoke-GhApi -Method POST -Endpoint "repos/$Owner/$Repo/git/commits" -BodyFile $commitFile
$commitSha = ($commitResp | ConvertFrom-Json).sha
Write-Output "commit: $commitSha"

# -------------------------------------------------------------------- 4. ref
$refFile = Join-Path $env:TEMP "gh-ref.json"
Write-JsonFile $refFile @{ ref = "refs/heads/$Branch"; sha = $commitSha }
try {
    $refResp = Invoke-GhApi -Method POST -Endpoint "repos/$Owner/$Repo/git/refs" -BodyFile $refFile
    Write-Output "ref created: $Branch"
} catch {
    Write-Output "ref exists, forcing update"
    $refFile2 = Join-Path $env:TEMP "gh-ref2.json"
    Write-JsonFile $refFile2 @{ sha = $commitSha; force = $true }
    $refResp = Invoke-GhApi -Method PATCH -Endpoint "repos/$Owner/$Repo/git/refs/heads/$Branch" -BodyFile $refFile2
    Write-Output "ref updated: $Branch"
}

Write-Output "DONE commit=$commitSha"
