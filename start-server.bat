@echo off
cd /d C:\Users\swede\acms
start /B node server/index.js
timeout /t 5 >nul
