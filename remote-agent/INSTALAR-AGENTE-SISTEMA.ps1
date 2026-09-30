param(
  [string]$SourceDirectory = $PSScriptRoot,
  [switch]$ReplaceConfig
)

$ErrorActionPreference = 'Stop'
$SourceDirectory = [System.IO.Path]::GetFullPath($SourceDirectory.Trim().Trim('"'))
$taskName = 'IDL Ativos e Chamados - Agente'
$watchdogTaskName = 'IDL Ativos e Chamados - Agente Watchdog'
$installDirectory = Join-Path $env:ProgramData 'IDL Ativos e Chamados\RemoteAgent'
$sourceExecutable = Join-Path $SourceDirectory 'IDL-Ativos-Agent.exe'
$sourceConfig = Join-Path $SourceDirectory 'agent.config.json'
$installedExecutable = Join-Path $installDirectory 'IDL-Ativos-Agent.exe'
$installedConfig = Join-Path $installDirectory 'agent.config.json'
$installedWatchdog = Join-Path $installDirectory 'agent-watchdog.ps1'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute este instalador com permissao de administrador.'
}
if (-not (Test-Path -LiteralPath $sourceExecutable)) {
  throw 'IDL-Ativos-Agent.exe nao encontrado ao lado do instalador.'
}
if (-not (Test-Path -LiteralPath $sourceConfig)) {
  throw 'agent.config.json nao encontrado ao lado do instalador.'
}

# Remove os dois modos antigos para impedir inicializacao duplicada ou avisos no login.
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'IDLAtivosAgent' -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $watchdogTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $watchdogTaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='IDL-Ativos-Agent.exe'" -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $sourceExecutable -Destination $installedExecutable -Force
if ($ReplaceConfig -or -not (Test-Path -LiteralPath $installedConfig)) {
  Copy-Item -LiteralPath $sourceConfig -Destination $installedConfig -Force
}

# Arquivos vindos de ZIP, e-mail ou navegador podem carregar Mark of the Web.
# Remover a marca na instalacao evita a pergunta "Deseja executar este arquivo?" a cada login.
Unblock-File -LiteralPath $installedExecutable -ErrorAction SilentlyContinue
Unblock-File -LiteralPath $installedConfig -ErrorAction SilentlyContinue

$watchdogScript = @"
`$ErrorActionPreference = 'SilentlyContinue'
`$taskName = '$taskName'
`$installDirectory = '$installDirectory'
`$executable = Join-Path `$installDirectory 'IDL-Ativos-Agent.exe'
`$config = Join-Path `$installDirectory 'agent.config.json'
`$log = Join-Path `$installDirectory 'agent-watchdog.log'
function Write-WatchdogLog([string]`$Message) {
  try {
    if ((Test-Path -LiteralPath `$log) -and (Get-Item -LiteralPath `$log).Length -gt 524288) {
      Copy-Item -LiteralPath `$log -Destination (`$log + '.previous') -Force
      Clear-Content -LiteralPath `$log
    }
    Add-Content -LiteralPath `$log -Value "[`$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] `$Message"
  } catch { }
}
if (-not (Test-Path -LiteralPath `$executable)) { Write-WatchdogLog 'Executavel ausente.'; exit 1 }
if (-not (Test-Path -LiteralPath `$config)) { Write-WatchdogLog 'Configuracao ausente.'; exit 1 }
`$running = Get-CimInstance Win32_Process -Filter "Name='IDL-Ativos-Agent.exe'" | Where-Object { `$_.ExecutablePath -eq `$executable }
if (`$running) { exit 0 }
Write-WatchdogLog 'Processo ausente; tentando iniciar pela tarefa principal.'
Start-ScheduledTask -TaskName `$taskName
Start-Sleep -Seconds 15
`$running = Get-CimInstance Win32_Process -Filter "Name='IDL-Ativos-Agent.exe'" | Where-Object { `$_.ExecutablePath -eq `$executable }
if (`$running) { Write-WatchdogLog 'Agente iniciado pela tarefa principal.'; exit 0 }
Write-WatchdogLog 'Tarefa principal nao iniciou o agente; iniciando processo diretamente.'
Start-Process -FilePath `$executable -WorkingDirectory `$installDirectory -WindowStyle Hidden
"@
[System.IO.File]::WriteAllText($installedWatchdog, $watchdogScript, [System.Text.UTF8Encoding]::new($false))
Unblock-File -LiteralPath $installedWatchdog -ErrorAction SilentlyContinue

# O arquivo de configuracao contem o token do agente.
& icacls.exe $installDirectory /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel proteger a pasta do agente.' }

$action = New-ScheduledTaskAction -Execute $installedExecutable -WorkingDirectory $installDirectory
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$dailyRecoveryTrigger = New-ScheduledTaskTrigger -Daily -At '03:00'
$systemPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($startupTrigger, $logonTrigger, $dailyRecoveryTrigger) -Principal $systemPrincipal -Settings $settings -Description 'Inventario e descoberta remota do IDL Ativos e Chamados.' -Force | Out-Null

$watchdogAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$installedWatchdog`"" -WorkingDirectory $installDirectory
$watchdogStartupTrigger = New-ScheduledTaskTrigger -AtStartup
$watchdogLogonTrigger = New-ScheduledTaskTrigger -AtLogOn
$watchdogRepeatTrigger = New-ScheduledTaskTrigger -Daily -At '00:00'
# O gatilho diario pode vir sem o objeto Repetition no Windows PowerShell.
# Cria o padrao pelos parametros oficiais e atribui o objeto completo.
$watchdogRepetition = New-ScheduledTaskTrigger -Once -At '00:00' -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 1)
$watchdogRepeatTrigger.Repetition = $watchdogRepetition.Repetition
$watchdogSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName $watchdogTaskName -Action $watchdogAction -Trigger @($watchdogStartupTrigger, $watchdogLogonTrigger, $watchdogRepeatTrigger) -Principal $systemPrincipal -Settings $watchdogSettings -Description 'Reinicia o agente IDL se ele nao permanecer em execucao.' -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Start-ScheduledTask -TaskName $watchdogTaskName
Start-Sleep -Seconds 2

$agentProcess = Get-Process -Name 'IDL-Ativos-Agent' -ErrorAction SilentlyContinue
$taskState = if ($agentProcess) { 'Em execucao' } else { 'Registrada; aguardando inicializacao' }
Write-Host ''
Write-Host 'Agente instalado com sucesso.' -ForegroundColor Green
Write-Host "Pasta: $installDirectory"
Write-Host "Tarefa: $taskName ($taskState)"
Write-Host "Watchdog: $watchdogTaskName (verifica a cada 5 minutos)"
Write-Host 'A permissao administrativa foi usada somente na instalacao.'
Write-Host 'Nos proximos reinicios o agente iniciara silenciosamente, sem pedir confirmacao.' -ForegroundColor Green
