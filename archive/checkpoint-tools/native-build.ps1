param([Parameter(Mandatory)][string]$Project)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'NATIVE-SLOT-PAUSED')){throw 'Native slot paused; build denied'}
$null=& (Join-Path $PSScriptRoot 'prepare-native-slot.ps1') -VerifyOnly
$expectedProject=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'native-slot/Philadelphia/Philadelphia.uproject'))
if([IO.Path]::GetFullPath($Project) -ne $expectedProject){throw 'Build target must be the isolated project'}
$localLog=Join-Path (Split-Path -Parent $Project) 'Saved/Logs/UnrealBuildTool.log'
New-Item -ItemType Directory -Path (Split-Path -Parent $localLog) -Force | Out-Null
& 'C:\Program Files\Epic Games\UE_5.7\Engine\Build\BatchFiles\Build.bat' PhiladelphiaEditor Win64 Development "-Project=$Project" -WaitMutex -NoHotReloadFromIDE "-Log=$localLog" -MaxParallelActions=1 -NoUBA -NoXGE -NoFASTBuild -NoSNDBS
exit $LASTEXITCODE
