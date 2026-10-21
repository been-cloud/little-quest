param([switch]$Foreground, [switch]$Restart)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$network = Get-NetIPConfiguration | Where-Object { $_.IPv4Address -and $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if (-not $network) { throw '没有找到已连接的局域网。请先连接 Wi-Fi。' }
$address = $network.IPv4Address.IPAddress
$port = 8788
$url = "http://${address}:$port"
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    if (-not $Restart -and ($listener.LocalAddress -eq $address -or $listener.LocalAddress -eq '0.0.0.0')) {
        try {
            $status = Invoke-RestMethod -Uri "$url/api/status" -TimeoutSec 3
            Write-Output "服务器已经运行：$url"
            Write-Output "AI: $($status.aiEnabled); 邮箱: $($status.mailEnabled)"
            exit 0
        } catch { }
    }
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($owner.CommandLine -notmatch 'server/index\.mjs') { throw "端口 $port 已被其他程序占用。" }
    Stop-Process -Id $listener.OwningProcess
    Start-Sleep -Seconds 1
}
$env:HOST = $address
$env:PORT = [string]$port
$env:AUTH_REQUIRED = 'true'
$env:NODE_ENV = 'production'
Set-Location $project
if ($Foreground) {
    Write-Output "服务器地址：$url"
    Write-Output '保持这个窗口打开，手机才能访问。'
    & node 'server/index.mjs'
    exit $LASTEXITCODE
}
$logDir = Join-Path $project 'server/data'
New-Item -ItemType Directory -Force $logDir | Out-Null
$node = (Get-Command node -ErrorAction Stop).Source
$process = Start-Process -FilePath $node -ArgumentList 'server/index.mjs' -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
Start-Sleep -Seconds 2
if ($process.HasExited) { throw '服务器启动失败。请检查 server/data/server-error.log。' }
$status = Invoke-RestMethod -Uri "$url/api/status" -TimeoutSec 5
Write-Output "服务器已经启动：$url"
Write-Output "AI: $($status.aiEnabled); 邮箱: $($status.mailEnabled)"
Write-Output "进程 ID：$($process.Id)；电脑需要保持开机且连接同一个 Wi-Fi。"
