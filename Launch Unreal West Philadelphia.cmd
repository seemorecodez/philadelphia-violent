@echo off
setlocal
cd /d "%~dp0"
"C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe" "%~dp0Unreal\Philadelphia\Philadelphia.uproject" /Game/Philadelphia/Maps/ChinatownEvaluation -game -windowed -ResX=1920 -ResY=1080 -PhillyNeighborhood=west -PhillyForwardSky -ini:Engine:[/Script/Engine.RendererSettings]:r.ForwardShading=True -ExecCmds="r.ScreenPercentage 100,t.MaxFPS 60,r.DynamicGlobalIlluminationMethod 0,r.ReflectionMethod 2,r.Shadow.Virtual.Enable 0,r.AntiAliasingMethod 2" -nosplash -nop4

