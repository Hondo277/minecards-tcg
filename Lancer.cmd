@echo off
title MineCards - TCG Master Server
cls
echo ========================================================
echo   LANCEMENT DU SERVEUR LOCAL MINECARDS
echo ========================================================
echo.
echo Ouverture automatique de votre navigateur...
start http://localhost:3000
echo.
echo Demarrage du serveur Node.js (Fermez cette fenetre pour arreter)...
node server.js
pause
