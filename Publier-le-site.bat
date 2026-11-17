@echo off
title IARINTSOA Hair - preparer la publication
rem Prepare le dossier "publication" (sans administration ni outils locaux), puis ouvre le dossier et la page Netlify.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils-local\preparer-publication.ps1"
if errorlevel 1 goto fin
explorer "%~dp0"
start "" "https://app.netlify.com/projects/iarintsoa-hair/deploys"
:fin
pause
