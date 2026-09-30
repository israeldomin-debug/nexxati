@echo off
setlocal
title IDL Ativos e Chamados - Instalar agente no Windows

fltmc >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Solicitando permissao de administrador apenas para instalar o agente...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALAR-AGENTE-SISTEMA.ps1"
if not "%errorlevel%"=="0" (
  echo.
  echo ERRO: a instalacao do agente nao foi concluida.
  pause
  exit /b 1
)
pause
