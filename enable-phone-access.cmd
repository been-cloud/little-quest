@echo off
powershell.exe -NoProfile -Command "Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoExit -NoProfile -ExecutionPolicy Bypass -File E:\ideasoftware\scripts\allow-local-server-firewall.ps1' -Wait"
pause
