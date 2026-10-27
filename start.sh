#!/usr/bin/env bash
# TryOn Live ko localhost pe chalata hai. Browser me kholo: http://localhost:8080/app.html
cd "$(dirname "$0")"
echo "TryOn Live chal raha hai -> http://localhost:8080/app.html"
python3 -m http.server 8080
