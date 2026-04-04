@echo off
setlocal disabledelayedexpansion

:: 检查是否提供了参数
if "%~1"=="" (
    echo 请将一个或多个文件夹拖拽到此脚本上进行批量处理
    pause
    exit /b 1
)

echo 开始批量处理文件夹...

:: 初始化计数器
set "processedCount=0"
set "errorCount=0"

:processLoop
:: 如果没有更多参数则跳转到完成部分
if "%~1"=="" goto :complete

:: 检查当前项目是否为目录
if not exist "%~1\" (
    echo 跳过 "%~1" （不是文件夹）
    set /a errorCount+=1
    shift
    goto :processLoop
)

:: 获取文件夹信息
set "folderPath=%~1"
set "folderName=%~nx1"
set "parentDir=%~dp1"

echo 正在处理: %folderName%

:: 创建临时目录用于压缩过程
set "tempDir=%temp%\cbz_process_%random%_%time:~6,2%%time:~9,2%"
mkdir "%tempDir%"

:: 使用存储压缩创建zip文件（无压缩）
powershell -command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('%folderPath%', '%tempDir%\%folderName%.zip', [System.IO.Compression.CompressionLevel]::NoCompression, $true)" >nul 2>&1

if errorlevel 1 (
    echo 错误: 无法创建压缩文件 "%folderName%"
    rmdir "%tempDir%" /s /q >nul 2>&1
    set /a errorCount+=1
) else (
    :: 将zip重命名为cbz
    ren "%tempDir%\%folderName%.zip" "%folderName%.cbz" >nul 2>&1

    :: 将cbz移动到原始位置
    move "%tempDir%\%folderName%.cbz" "%parentDir%" >nul 2>&1

    :: 清理临时目录
    rmdir "%tempDir%" /s /q >nul 2>&1

    :: 删除原始文件夹
    rmdir "%folderPath%" /s /q >nul 2>&1

    if errorlevel 1 (
        echo 警告: 无法删除原始文件夹 "%folderName%"
        set /a errorCount+=1
    ) else (
        echo 成功: 已创建 %parentDir%%folderName%.cbz
        set /a processedCount+=1
    )
)

shift
goto :processLoop

:complete
echo.
echo 批量处理完成!
echo 成功处理: %processedCount% 个文件夹
if %errorCount% gtr 0 (
    echo 出现错误: %errorCount% 个文件夹
)
pause
