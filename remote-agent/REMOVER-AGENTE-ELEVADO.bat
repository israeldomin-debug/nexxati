@echo off
setlocal
title IDL Ativos e Chamados - Remover agente elevado

fltmc >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0REMOVER-AGENTE-SISTEMA.ps1"
if not "%errorlevel%"=="0" (
  echo ERRO: nao foi possivel remover o agente.
  pause
  exit /b 1
)
pause
