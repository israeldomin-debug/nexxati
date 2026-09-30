param(
  [string]$ApiUrl = "http://localhost:3333/api",
  [Parameter(Mandatory = $true)][string]$NomeAgente,
  [string]$Destino = ".\agente-remoto-configurado"
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendEnv = Join-Path $raiz "backend\.env"
$origem = Join-Path $raiz "remote-agent"
$executavel = Join-Path $origem "dist\IDL-Ativos-Agent.exe"
$destinoCompleto = [System.IO.Path]::GetFullPath((Join-Path $raiz $Destino))

if (-not (Test-Path -LiteralPath $backendEnv)) {
  throw "Arquivo backend\.env não encontrado."
}
if (-not (Test-Path -LiteralPath $executavel)) {
  & (Join-Path $origem "COMPILAR-AGENTE.ps1")
}

$envContent = Get-Content -LiteralPath $backendEnv -Raw
$tokenMatch = [regex]::Match($envContent, '(?m)^REMOTE_AGENT_TOKEN="?([^"\r\n]+)"?')
$token = if ($tokenMatch.Success) { $tokenMatch.Groups[1].Value.Trim() } else { "" }
if ($token.Length -lt 32 -or $token -match 'gere|troque|token' ) {
  $bytes = New-Object byte[] 48
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $token = [Convert]::ToBase64String($bytes)
  if ($envContent -match '(?m)^REMOTE_AGENT_TOKEN=') {
    $envContent = [regex]::Replace($envContent, '(?m)^REMOTE_AGENT_TOKEN=.*$', "REMOTE_AGENT_TOKEN=$token")
  } else {
    $envContent = $envContent.TrimEnd() + "`r`nREMOTE_AGENT_TOKEN=$token`r`n"
  }
  [System.IO.File]::WriteAllText($backendEnv, $envContent, [System.Text.UTF8Encoding]::new($false))
}

if (-not $token) {
  $envContent = $envContent.TrimEnd() + "`r`nREMOTE_AGENT_TOKEN=$token`r`n"
}

New-Item -ItemType Directory -Path $destinoCompleto -Force | Out-Null
Remove-Item -LiteralPath (Join-Path $destinoCompleto "agent.js") -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $executavel -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "iniciar-agente.bat") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "README.md") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "INSTALAR-INICIALIZACAO-USUARIO.bat") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "REMOVER-INICIALIZACAO-USUARIO.bat") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "INSTALAR-AGENTE-ELEVADO.bat") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "REMOVER-AGENTE-ELEVADO.bat") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "INSTALAR-AGENTE-SISTEMA.ps1") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "REMOVER-AGENTE-SISTEMA.ps1") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "DIAGNOSTICAR-AGENTE.ps1") -Destination $destinoCompleto -Force
Copy-Item -LiteralPath (Join-Path $origem "DIAGNOSTICAR-AGENTE-ELEVADO.bat") -Destination $destinoCompleto -Force

$config = [ordered]@{
  apiUrl = $ApiUrl.TrimEnd("/")
  token = $token
  agentName = $NomeAgente
  productName = "IDL Ativos e Chamados"
  pollSeconds = 60
  heartbeatSeconds = 60
  inventoryMinutes = 15
  updateMinutes = 15
}
$configJson = $config | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $destinoCompleto "agent.config.json"), $configJson, [System.Text.UTF8Encoding]::new($false))

Write-Host "Agente configurado em: $destinoCompleto" -ForegroundColor Green
Write-Host "Reinicie o backend e copie essa pasta para a empresa remota." -ForegroundColor Yellow
Write-Host "Na tela do sistema, use exatamente este nome: $NomeAgente"
