Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$base=$PSScriptRoot
$fixture=Join-Path $base ('g-'+[guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path (Join-Path $fixture 'evidence'),(Join-Path $fixture 'native-slot/Philadelphia/Config') -Force|Out-Null
foreach($name in @('prepare-native-slot.ps1','run-native-slot.ps1','native-build.ps1','native-slot-checks.ps1')){Copy-Item -LiteralPath (Join-Path $base $name) -Destination $fixture}
$config=Join-Path $fixture 'native-slot/Philadelphia/Config/DefaultEngine.ini'
[IO.File]::WriteAllText($config,"[/Script/EngineSettings.GameMapsSettings]`nGameDefaultMap=/Game/Philadelphia/Maps/ChinatownEvaluation`n")
$results=[Collections.Generic.List[object]]::new()
$global:NativeLaunchIntercepted=$false
function Start-Process { $global:NativeLaunchIntercepted=$true; throw 'TEST INTERCEPTED AN UNEXPECTED PROCESS LAUNCH' }
function Expect-Rejection([string]$Name,[string]$Pattern){
 $global:NativeLaunchIntercepted=$false;$message=''
 try{& (Join-Path $fixture 'run-native-slot.ps1') -Mode game -Label guard-test|Out-Null}catch{$message=$_.Exception.Message}
 if($global:NativeLaunchIntercepted -or $message -notmatch $Pattern){throw "Guard failed: $Name : $message"}
 $results.Add([pscustomobject]@{test=$Name;passed=$true;processLaunchAttempted=$false;rejection=$message})
}
$ready=& (Join-Path $fixture 'prepare-native-slot.ps1')
$verified=& (Join-Path $fixture 'prepare-native-slot.ps1') -VerifyOnly
if(!$verified.writeReadRenameDeletePassed -or $verified.runtimeConfigVerified){throw 'Setup-only validation failed'}
$results.Add([pscustomobject]@{test='Valid setup performs safe cache checks only';passed=$true;processLaunchAttempted=$global:NativeLaunchIntercepted;rejection=''})
$receipt=Join-Path $fixture 'evidence/setup-ready.json';$receiptBytes=[IO.File]::ReadAllBytes($receipt);$configBytes=[IO.File]::ReadAllBytes($config)
try{
 [IO.File]::WriteAllText((Join-Path $fixture 'NATIVE-SLOT-PAUSED'),'test pause')
 Expect-Rejection 'Pause lock prevents launcher entry' 'Native slot paused'
 Remove-Item -LiteralPath (Join-Path $fixture 'NATIVE-SLOT-PAUSED')
 Remove-Item -LiteralPath $receipt
 Expect-Rejection 'Failed or missing setup cannot launch' 'No successful setup receipt'
 [IO.File]::WriteAllBytes($receipt,$receiptBytes)
 [IO.File]::AppendAllText($config,"`n[PhiladelphiaIsolatedDDC]`nLocal=(Type=FileSystem, Path=C:/outside-workspace)`n")
 Expect-Rejection 'Later INI override cannot redirect cache' 'Unexpected resolved local node'
 [IO.File]::WriteAllBytes($config,$configBytes)
 $build=Join-Path $fixture 'native-build.ps1';$buildBytes=[IO.File]::ReadAllBytes($build)
 try{
  [IO.File]::AppendAllText($build,"`n# Simulated edit after successful setup`n")
  Expect-Rejection 'Stale setup receipt rejects changed scripts' 'Setup script changed after preparation'
 }finally{[IO.File]::WriteAllBytes($build,$buildBytes)}
 $bad=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json;$bad.configSha256='0000'
 $bad|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $receipt
 Expect-Rejection 'Receipt integrity mismatch cannot launch' 'Setup receipt/config mismatch'
}finally{
 [IO.File]::WriteAllBytes($config,$configBytes);[IO.File]::WriteAllBytes($receipt,$receiptBytes)
 [IO.File]::WriteAllText((Join-Path $fixture 'NATIVE-SLOT-PAUSED'),'Test fixture is permanently paused; no native assets or executable project here.')
 Remove-Item Function:Start-Process -ErrorAction SilentlyContinue
}
$results|ConvertTo-Json -Depth 4|Tee-Object -FilePath (Join-Path $base 'evidence/setup-guard-tests.json')
if(!(Test-Path -LiteralPath (Join-Path $base 'NATIVE-SLOT-PAUSED'))){throw 'Real pause lock was lost'}
