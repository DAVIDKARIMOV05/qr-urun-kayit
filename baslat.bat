@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QR Urun Listesi - yerel sunucu

echo ============================================================
echo   QR URUN LISTESI - yerel test sunucusu
echo   Adres : http://localhost:8080
echo   Etiket: http://localhost:8080/etiket.html
echo.
echo   ONEMLI: Kamerayi TELEFONDA kullanmak icin HTTPS gerekir.
echo   Telefonlar icin kurulum: kurulum.html (Netlify/GitHub Pages)
echo   Bu sunucu sadece bilgisayarda arayuzu denemek icindir.
echo   Durdurmak icin: CTRL + C
echo ============================================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:8080"
  python -m http.server 8080
  goto :son
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:8080"
  py -m http.server 8080
  goto :son
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:8080"
  npx --yes http-server -p 8080 -c-1 .
  goto :son
)

echo Bilgisayarda Python veya Node bulunamadi.
echo Kurulum: https://www.python.org/downloads/ (kurarken "Add to PATH" secin)
echo ya da dosyalari Netlify Drop'a surukleyin: https://app.netlify.com/drop
pause

:son
