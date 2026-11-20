@echo off
rem CIABOC RVM - NFC bridge for the reception PC (needs Java 17+ JDK and a USB PC/SC NFC reader).
rem Keep this window open while issuing visitor cards. Put a shortcut in shell:startup to start it at sign-in.
rem
rem Set the web app address(es) the receptionist opens, comma separated, e.g.
rem   set NFC_BRIDGE_ALLOWED_ORIGINS=https://rvm.ciaboc.gov.lk
if "%NFC_BRIDGE_ALLOWED_ORIGINS%"=="" set NFC_BRIDGE_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081
cd /d "%~dp0"
java NfcBridge.java
pause
