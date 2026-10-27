@echo off
cd /d "%~dp0"
echo TryOn Live chal raha hai -^> http://localhost:8080/app.html
python -m http.server 8080
