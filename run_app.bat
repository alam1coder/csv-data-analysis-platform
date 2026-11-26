@echo off
echo Starting Antigravity - AI Data Analysis Platform...
start http://localhost:8000
if exist .venv\Scripts\python.exe (
    .venv\Scripts\python.exe server.py
) else (
    python server.py
)
pause
