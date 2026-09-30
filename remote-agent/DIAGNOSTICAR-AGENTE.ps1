$ErrorActionPreference = 'SilentlyContinue'
$taskName = 'IDL Ativos e Chamados - Agente'
$watchdogTaskName = 'IDL Ativos e Chamados - Agente Watchdog'
$installDirectory = Join-Path $env:ProgramData 'IDL Ativos e Chamados\RemoteAgent'
$executable = Join-Path $installDirectory 'IDL-Ativos-Agent.exe'
$configPath = Join-Path $installDirectory 'agent.config.json'
$logPath = Join-Path $installDirectory 'agent.log'
$watchdogLogPath = Join-Path $installDirectory 'agent-watchdog.log'

Write-Host '=== Diagnostico do Agente IDL ===' -ForegroundColor Cyan
Write-Host "Data: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')"
Write-Host "Pasta instalada: $(Test-Path -LiteralPath $installDirectory)"
Write-Host "Executavel: $(Test-Path -LiteralPath $executable)"
Write-Host "Configuracao: $(Test-Path -LiteralPath $configPath)"

$taskQuery = & schtasks.exe /Query /TN $taskName /FO LIST 2>&1
$taskFound = $LASTEXITCODE -eq 0
Write-Host "Tarefa registrada: $(if ($taskFound) { 'SIM' } else { 'NAO' })" -ForegroundColor $(if ($taskFound) { 'Green' } else { 'Red' })
if ($taskFound) { $taskQuery | Select-Object -First 8 | ForEach-Object { Write-Host $_ } }

$watchdogQuery = & schtasks.exe /Query /TN $watchdogTaskName /FO LIST 2>&1
$watchdogFound = $LASTEXITCODE -eq 0
Write-Host "Watchdog registrado: $(if ($watchdogFound) { 'SIM' } else { 'NAO' })" -ForegroundColor $(if ($watchdogFound) { 'Green' } else { 'Red' })
if ($watchdogFound) { $watchdogQuery | Select-Object -First 8 | ForEach-Object { Write-Host $_ } }

$process = Get-Process -Name 'IDL-Ativos-Agent'
Write-Host "Processo ativo: $([bool]$process)$(if ($process) { " | PID: $($process.Id -join ', ')" })" -ForegroundColor $(if ($process) { 'Green' } else { 'Red' })

if (Test-Path -LiteralPath $configPath) {
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  Write-Host "Servidor: $($config.apiUrl)"
  Write-Host "Nome do agente: $($config.agentName)"
  Write-Host "Intervalos: consulta $($config.pollSeconds)s | heartbeat $($config.heartbeatSeconds)s | inventario $($config.inventoryMinutes)min"
  try {
    $healthUrl = "$($config.apiUrl.TrimEnd('/'))/health"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 8
    Write-Host "Servidor acessivel: SIM (HTTP $($response.StatusCode))" -ForegroundColor Green
  } catch {
    Write-Host "Servidor acessivel: NAO - $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ''
Write-Host '=== Ultimas linhas do log ===' -ForegroundColor Cyan
if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Tail 30 }
else { Write-Host 'O agente ainda nao criou o arquivo de log.' -ForegroundColor Yellow }

Write-Host ''
Write-Host '=== Ultimas linhas do watchdog ===' -ForegroundColor Cyan
if (Test-Path -LiteralPath $watchdogLogPath) { Get-Content -LiteralPath $watchdogLogPath -Tail 20 }
else { Write-Host 'O watchdog ainda nao registrou eventos.' -ForegroundColor Yellow }
