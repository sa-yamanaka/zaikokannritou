@echo off
chcp 65001 > nul
cd /d "%~dp0"

start "" http://localhost:5000/
python server.py

pause
