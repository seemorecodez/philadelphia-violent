$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$project = Join-Path $projectRoot 'Philadelphia.uproject'
$build = 'C:/Program Files/Epic Games/UE_5.7/Engine/Build/BatchFiles/Build.bat'
& $build PhiladelphiaEditor Win64 Development "-Project=$project" -WaitMutex -NoHotReloadFromIDE -MaxParallelActions=2
if ($LASTEXITCODE -ne 0) { throw "Philadelphia native build failed: $LASTEXITCODE" }
