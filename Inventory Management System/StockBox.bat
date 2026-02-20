@echo off
cd /d "%~dp0"

echo Starting Inventory Management System...

:: 1. Start MongoDB
:: Assumes 'mongod' is in your PATH. If not, replace 'mongod' with the full path to mongod.exe
start "MongoDB" mongod

:: 2. Start Backend
cd backend
start "Backend API" cmd /k "call venv\Scripts\activate && uvicorn main:app --reload"
cd ..

:: 3. Start Frontend
cd frontend
start "Frontend Client" npm start
cd ..
