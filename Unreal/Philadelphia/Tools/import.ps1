$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $projectRoot 'Philadelphia.uproject'
$script = (Join-Path $projectRoot 'Scripts/import_evaluation.py').Replace('\','/')
$editor = 'C:/Program Files/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor-Cmd.exe'
& $editor $project -run=pythonscript "-script=$script" -unattended -nop4 -nosplash -nullrhi -stdout -FullStdOutLogOutput
if ($LASTEXITCODE -ne 0) { throw "Philadelphia asset import failed: $LASTEXITCODE" }
