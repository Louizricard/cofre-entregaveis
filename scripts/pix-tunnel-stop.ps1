# Stop only the processes of this workspace's isolated spike.
$ErrorActionPreference = 'Stop'
$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$statePath = Join-Path $workspaceRoot '.local/pix-tunnel.json'
if (!(Test-Path -LiteralPath $statePath)) { Write-Output 'Nenhum túnel de teste registrado.'; exit 0 }
$tunnelState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$expectedClient = Join-Path $workspaceRoot '.tools/cloudflared/2026.10.0/cloudflared.exe'
$expectedNode = Join-Path $workspaceRoot '.tools/node/node-v24.21.0-win-x64/node.exe'
$expectedReceiver = Join-Path $workspaceRoot 'apps/api/dist/src/pix-receiver-main.js'
$tunnelChildId = [int]$tunnelState.pid
$wrapperId = [int]$tunnelState.wrapperPid
if ($tunnelChildId -le 0 -or $wrapperId -le 0) { throw 'Registro de processo inválido. Inspecione sem encerrar outros processos.' }
$tunnelChild = Get-CimInstance Win32_Process -Filter "ProcessId=$tunnelChildId"
if ($tunnelChild) {
 if ($tunnelChild.ExecutablePath -ne $expectedClient -or $tunnelChild.ParentProcessId -ne $wrapperId -or $tunnelChild.CommandLine -notmatch '--url http://127\.0\.0\.1:3101') {
  throw 'O PID não corresponde ao túnel isolado esperado. Nenhum processo foi encerrado.'
 }
 Stop-Process -Id $tunnelChildId -Force
}
$wrapperProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$wrapperId"
if ($wrapperProcess -and $wrapperProcess.ExecutablePath -eq $expectedNode -and $wrapperProcess.CommandLine -match 'scripts/pix-tunnel\.mjs') {
 # The child exit normally ends its wrapper; allow it to write the final state.
 $wrapperHandle = Get-Process -Id $wrapperId -ErrorAction SilentlyContinue
 if ($wrapperHandle -and !$wrapperHandle.WaitForExit(5000)) { Stop-Process -Id $wrapperId -Force }
}
$receivers = @(Get-CimInstance Win32_Process | Where-Object {
 $_.ExecutablePath -eq $expectedNode -and ($_.CommandLine -match '" apps/api/dist/src/pix-receiver-main\.js\s*"?$' -or $_.CommandLine -match ('"?'+[regex]::Escape($expectedReceiver)+'"?\s*$'))
})
if ($receivers.Count -gt 1) { throw 'Mais de um receptor encontrado; túnel encerrado, confira os receptores manualmente.' }
if ($receivers.Count -eq 1) { Stop-Process -Id $receivers[0].ProcessId -Force }
$tunnelState.running = $false
$tunnelState | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
Write-Output 'Túnel e receptor isolado encerrados. API, painel e worker preservados.'
