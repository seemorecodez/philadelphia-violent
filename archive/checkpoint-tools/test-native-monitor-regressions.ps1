Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'native-slot-checks.ps1')
$results=[Collections.Generic.List[object]]::new()
function Check([string]$Name,[bool]$Passed){if(!$Passed){throw "Regression failed: $Name"};$results.Add([pscustomobject]@{test=$Name;passed=$true;nativeProcessesLaunched=0})}
$prefix=[IO.Path]::GetFullPath($PSScriptRoot)+'/'
$valid=$prefix+('x'*(118-$prefix.Length))
Check '118-character cache root accepted' ((Assert-NativeCacheRoot $valid).Length -eq 118)
foreach($length in @(119,120,124)){
 $message='';try{$null=Assert-NativeCacheRoot ($prefix+('x'*($length-$prefix.Length)))}catch{$message=$_.Exception.Message}
 Check "Cache root length $length rejected before filesystem or launch" ($message -match 'shorter than 119')
}
Check 'Empty process collection consumes zero bytes under StrictMode' ((Get-NativeWorkingSetBytes -Processes @()) -eq 0)
Check 'Nonempty working sets sum correctly' ((Get-NativeWorkingSetBytes -Processes @([pscustomobject]@{WorkingSet64=10},[pscustomobject]@{WorkingSet64=20})) -eq 30)
$fake=[pscustomobject]@{HasExited=$true;ExitCode=3;Id=2147483000;StartTime=[DateTime]::Now;waited=$false}
$fake|Add-Member ScriptMethod Refresh {}
$fake|Add-Member ScriptMethod WaitForExit {$this.waited=$true}
$exitState=Get-NativeExitState $fake
Check 'Exited process preserves exit 3 even when process list is empty' ($exitState.hasExited -and $exitState.exitCode -eq 3 -and $fake.waited -and (Get-NativeWorkingSetBytes @()) -eq 0)
$fake.HasExited=$false;$fake.waited=$false
$exitState=Get-NativeExitState $fake
Check 'Live process is not waited on and has no fabricated exit code' (!$exitState.hasExited -and $null -eq $exitState.exitCode -and !$fake.waited)
$fake.HasExited=$true;$fake.ExitCode=$null;$message=''
try{$null=Get-NativeExitState $fake}catch{$message=$_.Exception.Message}
Check 'Missing exit code fails closed' ($message -match 'cannot classify as success')
$fake.ExitCode=3
# Exercise the real runner with a fake exited process; all process APIs intercepted.
$fixture=Join-Path $PSScriptRoot ('r-'+[guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path (Join-Path $fixture 'evidence'),(Join-Path $fixture 'native-slot/Philadelphia/Config') -Force|Out-Null
foreach($name in @('prepare-native-slot.ps1','run-native-slot.ps1','native-build.ps1','native-slot-checks.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $fixture}
[IO.File]::WriteAllText((Join-Path $fixture 'native-slot/Philadelphia/Config/DefaultEngine.ini'),'; synthetic no-launch regression fixture')
$null=& (Join-Path $fixture 'prepare-native-slot.ps1')
function Start-Process {return $fake}
function Get-Process {return @()}
function Get-Counter {return [pscustomobject]@{CounterSamples=@([pscustomobject]@{CookedValue=20GB})}}
function Stop-Process {throw 'Unexpected stop attempt in no-launch fixture'}
try{
 $message='';try{& (Join-Path $fixture 'run-native-slot.ps1') -Mode game -Label empty-exit -DeadlineSeconds 1|Out-Null}catch{$message=$_.Exception.Message}
 $record=Get-Content -LiteralPath (Join-Path $fixture 'evidence/empty-exit/result.json') -Raw|ConvertFrom-Json
 Check 'Real runner records nonzero exit and throws to its caller' ($record.exitCode -eq 3 -and $record.result -eq 'process exited: 3' -and $message -match 'Native check failed: process exited: 3')
 Check 'Real runner cleanup is safe for an empty process tree' (@($record.remainingOwnedPids).Count -eq 0)
}finally{
 foreach($name in @('Start-Process','Get-Process','Get-Counter','Stop-Process')){Remove-Item -LiteralPath ('Function:'+$name)}
 [IO.File]::WriteAllText((Join-Path $fixture 'NATIVE-SLOT-PAUSED'),'No-launch regression fixture; permanently paused.')
}
Check 'Actual native runner remains locked' (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'NATIVE-SLOT-PAUSED'))
$results|ConvertTo-Json -Depth 4|Tee-Object -FilePath (Join-Path $PSScriptRoot 'evidence/monitor-regression-tests.json')
