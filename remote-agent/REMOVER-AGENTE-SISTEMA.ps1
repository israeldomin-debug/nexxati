$ErrorActionPreference = 'Stop'
$taskName = 'IDL Ativos e Chamados - Agente'
$watchdogTaskName = 'IDL Ativos e Chamados - Agente Watchdog'
$installDirectory = Join-Path $env:ProgramData 'IDL Ativos e Chamados\RemoteAgent'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute este removedor com permissao de administrador.'
}

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $watchdogTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $watchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'IDLAtivosAgent' -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $installDirectory) {
  Remove-Item -LiteralPath $installDirectory -Recurse -Force
}

Write-Host 'Agente removido da inicializacao do Windows.' -ForegroundColor Green
