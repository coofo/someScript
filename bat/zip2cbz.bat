@echo off
:: 批量将拖入的.zip文件重命名为.cbz扩展名

:: 检查是否有参数传入
if "%~1"=="" (
    echo 请将.zip文件拖放到此脚本上
    pause
    exit /b
)

::setlocal enabledelayedexpansion
setlocal disabledelayedexpansion
set "success_count=0"
set "fail_count=0"

:: 遍历所有拖入的文件
for %%i in (%*) do (
    echo 处理文件: "%%~nxi"
    
    :: 检查文件扩展名是否为.zip
    if /i "%%~xi" neq ".zip" (
        echo   错误：文件 "%%~nxi" 不是.zip格式
        set /a fail_count+=1
    ) else (
        :: 构造新的文件路径（将.zip改为.cbz）
        set "newname=%%~dpni.cbz"
        
        :: 重命名文件
        ren "%%~fi" "%%~ni.cbz"
        
        :: 检查重命名是否成功
        if errorlevel 1 (
            echo   文件重命名失败
            set /a fail_count+=1
        ) else (
            echo   文件已成功重命名为: %%~ni.cbz
            set /a success_count+=1
        )
    )
    echo.
)

:: 显示处理结果统计
echo ========================
echo 批量处理完成！
echo 成功: %success_count% 个文件
echo 失败: %fail_count% 个文件
echo ========================
pause
