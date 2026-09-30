@echo off
setlocal
title IDL Ativos e Chamados - Diagnostico do agente

fltmc >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permissao de administrador para consultar a tarefa do sistema...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DIAGNOSTICAR-AGENTE.ps1"
echo.
pause
