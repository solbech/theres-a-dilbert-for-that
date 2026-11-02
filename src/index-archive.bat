@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0index-archive.ps1" %*
pause
