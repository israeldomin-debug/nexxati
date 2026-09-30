$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$output = Join-Path $root "dist"
New-Item -ItemType Directory -Path $output -Force | Out-Null
$compiler = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $compiler)) { throw "Compilador C# do Windows não encontrado." }

& $compiler /nologo /target:exe /optimize+ /platform:anycpu `
  /reference:System.dll /reference:System.Core.dll /reference:System.Management.dll `
  /reference:System.Web.Extensions.dll `
  /out:"$output\IDL-Ativos-Agent.exe" `
  "$root\IDL.Ativos.RemoteAgent.cs"

if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o agente." }
$executable = Join-Path $output 'IDL-Ativos-Agent.exe'
$source = Get-Content -LiteralPath (Join-Path $root 'IDL.Ativos.RemoteAgent.cs') -Raw
$versionMatch = [regex]::Match($source, 'private const string Version = "([0-9]+\.[0-9]+\.[0-9]+)"')
if (-not $versionMatch.Success) { throw 'Versao do agente nao encontrada no codigo-fonte.' }
$release = [ordered]@{
  version = $versionMatch.Groups[1].Value
  file = 'IDL-Ativos-Agent.exe'
  sha256 = (Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant()
  size = (Get-Item -LiteralPath $executable).Length
  publishedAt = (Get-Date).ToUniversalTime().ToString('o')
}
[System.IO.File]::WriteAllText((Join-Path $output 'agent-release.json'), ($release | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
Write-Host "Executavel v$($release.version) criado em $executable" -ForegroundColor Green
Write-Host "Manifesto de atualizacao criado em $output\agent-release.json" -ForegroundColor Green
