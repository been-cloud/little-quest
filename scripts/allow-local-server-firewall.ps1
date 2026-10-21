$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw '请以管理员身份运行这个脚本。'
}

$listener = Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction Stop | Select-Object -First 1
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
if ($serverProcess.CommandLine -notmatch 'server/index\.mjs') {
    throw '8788 端口不是小小任务服务器；没有修改防火墙。'
}

$ruleName = 'Little Quest local server 8788'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Output '小小任务防火墙规则已经存在。'
} else {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8788 -Program $serverProcess.ExecutablePath -Profile Private -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
    Write-Output '已允许当前局域网通过专用网络访问小小任务的 8788 端口。'
}
Write-Output "服务器：$($listener.LocalAddress):8788"
Write-Output "Node：$($serverProcess.ExecutablePath)"
