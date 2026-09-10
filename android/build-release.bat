@echo off
taskkill /F /IM java.exe 2>nul
timeout /t 3 /nobreak >nul

set JAVA_HOME=C:\Program Files\Android\openjdk\jdk-21.0.8
set ANDROID_HOME=C:\Users\RR CCTV\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%PATH%
set TMP=C:\rr-temp
set TEMP=C:\rr-temp
set LOCALAPPDATA=C:\rr-temp
set SQLITE_TMPDIR=C:\rr-temp
set JAVA_TOOL_OPTIONS=-Djava.io.tmpdir=C:/rr-temp -Dorg.sqlite.tmpdir=C:/rr-temp -DSQLITE_TMPDIR=C:/rr-temp
set _JAVA_OPTIONS=-Djava.io.tmpdir=C:/rr-temp -Dorg.sqlite.tmpdir=C:/rr-temp -DSQLITE_TMPDIR=C:/rr-temp
set GRADLE_OPTS=-Djava.io.tmpdir=C:/rr-temp -Dorg.sqlite.tmpdir=C:/rr-temp -DSQLITE_TMPDIR=C:/rr-temp

if not exist C:\rr-temp mkdir C:\rr-temp

cd /d "C:\Billing Ps Android\rr-billing-pro-new\android"
call gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon
