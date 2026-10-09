param([Parameter(Mandatory)][ValidateSet('build','game','editor')][string]$Mode,[Parameter(Mandatory)][ValidatePattern('^[a-z-]+$')][string]$Label,[ValidateRange(1,600)][int]$DeadlineSeconds=180,[switch]$InteractiveView,[switch]$KeepOpenOnReady)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
$base=$PSScriptRoot
if(Test-Path -LiteralPath (Join-Path $base 'NATIVE-SLOT-PAUSED')){throw 'Native slot paused by parent; no launch permitted'}
if($KeepOpenOnReady -and (!$InteractiveView -or $Mode -notin @('game','editor'))){throw 'Continuous viewing requires visible game mode'}
if($Mode -eq 'game' -and !$KeepOpenOnReady -and $DeadlineSeconds -gt 180){throw 'Game deadline cannot exceed 180 seconds'}
$setup=& (Join-Path $base 'prepare-native-slot.ps1') -VerifyOnly
if($setup.status -ne 'safe setup checks passed; Unreal not started'){throw 'Setup did not pass; launch denied'}
. (Join-Path $base 'native-slot-checks.ps1')
$projectRoot=Join-Path $base 'native-slot/Philadelphia'
$project=Join-Path $projectRoot 'Philadelphia.uproject'
$evidence=Join-Path $base ('evidence/'+$Label)
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$available=[long](Get-Counter '\Memory\Available Bytes' -MaxSamples 1 -ErrorAction Stop).CounterSamples[0].CookedValue
if($available -lt 10GB){throw "Insufficient available RAM: $available"}
if((Get-PSDrive C).Free -lt 12GB){throw 'Less than 12 GiB free disk'}
if(Get-Process -Name UnrealEditor,UnrealEditor-Cmd,ShaderCompileWorker,UnrealBuildTool -ErrorAction SilentlyContinue){throw 'Native process already running; reschedule'}
$start=(Get-Date).ToUniversalTime()
$timer=[Diagnostics.Stopwatch]::StartNew()
$owned=@{}
$samples=[System.Collections.Generic.List[object]]::new()
$handoff=$false;$readyAt=$null;$lastProgress=0.0;$priorCpu=0.0;$priorCacheBytes=-1L;$priorLogLength=-1L
$result='not started';$exitCode=$null;$peak=0L;$root=$null
try {
 if($Mode -eq 'build'){
  $exe=(Get-Command pwsh).Source
  $arguments=@('-NoProfile','-NonInteractive','-File',('"'+(Join-Path $base 'native-build.ps1')+'"'),'-Project',('"'+$project+'"'))
 }else{
  $exe='C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor.exe'
  $arguments=@(('"'+$project+'"'),'/Game/Philadelphia/Maps/ChinatownEvaluation','-game','-windowed','-ResX=1920','-ResY=1080','-ForceRes','-NoVSync','-PhillyNeighborhood=west','-DDC=PhiladelphiaIsolatedDDC','-PhillyMechanicsProbe','-PhillyForwardSky','-ini:Engine:[/Script/Engine.RendererSettings]:r.ForwardShading=True','-ini:Engine:[DevOptions.Shaders]:ShaderCompilerCoreCountThreshold=999','-ini:Engine:[DevOptions.Shaders]:NumUnusedShaderCompilingThreads=11','-ini:Engine:[DevOptions.Shaders]:NumUnusedShaderCompilingThreadsDuringGame=11','-ini:Input:[/Script/Engine.InputSettings]:bShouldFlushPressedKeysOnViewportFocusLost=False','"-ExecCmds=r.ScreenPercentage 100,t.MaxFPS 30,r.DynamicGlobalIlluminationMethod 0,r.ReflectionMethod 2,r.Shadow.Virtual.Enable 0,r.AntiAliasingMethod 2"','-unattended','-nosplash','-nop4',('-abslog="'+(Join-Path $evidence 'game.log')+'"'))
  $arguments+=@($setup.privacyArguments)
  if($Mode -eq 'editor'){$arguments=@($arguments|Where-Object {$_ -notin @('-game','-unattended','-nosplash','-PhillyMechanicsProbe')})}
  if($InteractiveView){$arguments=@($arguments|Where-Object {$_ -ne '-PhillyMechanicsProbe' -and $_ -notlike '-ini:Input:*'})}
 }
 if(Test-Path -LiteralPath (Join-Path $base 'NATIVE-SLOT-PAUSED')){throw 'Pause lock appeared; launch denied'}
 $null=& (Join-Path $base 'prepare-native-slot.ps1') -VerifyOnly
 @{mode=$Mode;label=$Label;startedUtc=$start;exe=$exe;arguments=$arguments;availableBytes=$available;deadlineSeconds=$DeadlineSeconds;workingSetLimitBytes=8GB} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $evidence 'launch.json')
 $windowStyle=if($InteractiveView){'Normal'}else{'Hidden'}
 $root=Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle $windowStyle -PassThru -RedirectStandardOutput (Join-Path $evidence 'stdout.log') -RedirectStandardError (Join-Path $evidence 'stderr.log')
 $owned[$root.Id]=$root.StartTime.ToUniversalTime().Ticks
 Write-Output "Started owned $Mode PID=$($root.Id), deadline=$DeadlineSeconds seconds; evidence=$evidence"
 while($true){
  $exitState=Get-NativeExitState $root
  if($exitState.hasExited){$exitCode=$exitState.exitCode;$result="process exited: $exitCode";break}
  $all=@(Get-Process)
  # Parent is PowerShell's supported process property; no CIM/WMI calls.
  for($pass=0;$pass -lt 5;$pass++){
   foreach($proc in $all){
    if($owned.ContainsKey($proc.Id)){continue}
    try{$parent=$proc.Parent;if($parent -and $owned.ContainsKey($parent.Id) -and $parent.StartTime.ToUniversalTime().Ticks -eq $owned[$parent.Id]){$owned[$proc.Id]=$proc.StartTime.ToUniversalTime().Ticks}}catch{}
   }
  }
  $live=@();foreach($proc in $all){if($owned.ContainsKey($proc.Id)){try{if($proc.StartTime.ToUniversalTime().Ticks -eq $owned[$proc.Id]){$live+=$proc}}catch{}}}
  $memory=Get-NativeWorkingSetBytes -Processes $live
  $peak=[Math]::Max($peak,$memory)
  $shaders=@($live | Where-Object ProcessName -eq 'ShaderCompileWorker').Count
  $bytes=0L;foreach($file in Get-ChildItem -LiteralPath (Join-Path $base 'native-slot'),$setup.cachePath -Recurse -File){$bytes+=$file.Length}
  $samples.Add([pscustomobject]@{elapsed=[Math]::Round($timer.Elapsed.TotalSeconds,2);workingSetBytes=$memory;shaderWorkers=$shaders;projectBytes=$bytes;pids=(@($live|ForEach-Object Id) -join ',');names=(@($live|ForEach-Object ProcessName) -join ',')})
  if($memory -gt 8GB){$result='stopped: process tree exceeded 8 GiB';break}
  if($bytes -gt 12GB){$result='stopped: project exceeded 12 GiB';break}
  if($shaders -gt 1){$result='stopped: more than one shader worker';break}
  if(@($live|ForEach-Object ProcessName) -match 'Uba|xgConsole|FBuild|dbsbuild'){$result='stopped: unexpected executor';break}
  if(!$KeepOpenOnReady -and $timer.Elapsed.TotalSeconds -gt $DeadlineSeconds){$result=if($InteractiveView){'viewing deadline reached'}else{'stopped: watchdog deadline'};break}
  $exitState=Get-NativeExitState $root
  if($exitState.hasExited){$exitCode=$exitState.exitCode;$result="process exited: $exitCode";break}
  if(Test-Path -LiteralPath (Join-Path $base 'NATIVE-SLOT-PAUSED')){$result='stopped: parent pause lock';break}
  if($Mode -in @('game','editor')){
   $log=Join-Path $evidence 'game.log'
   if($KeepOpenOnReady){
    $cacheBytes=0L;$cacheCount=0
    foreach($cacheFile in Get-ChildItem -LiteralPath $setup.cachePath -Recurse -File){$cacheBytes+=$cacheFile.Length;$cacheCount++}
    $cpu=0.0;foreach($proc in $live){try{$cpu+=$proc.TotalProcessorTime.TotalSeconds}catch{}}
    $logLength=if(Test-Path -LiteralPath $log){(Get-Item -LiteralPath $log).Length}else{0L}
    if($cpu -gt $priorCpu+0.2 -or $cacheBytes -ne $priorCacheBytes -or $logLength -ne $priorLogLength){$lastProgress=$timer.Elapsed.TotalSeconds}
    $priorCpu=$cpu;$priorCacheBytes=$cacheBytes;$priorLogLength=$logLength
    $stage=if($null -ne $readyAt){'visible application ready; monitoring stability'}elseif($Mode -eq 'editor'){'interactive editor startup; waiting for editor workspace'}else{'startup; waiting for grounded player and game window'}
    @{elapsedSeconds=$timer.Elapsed.TotalSeconds;stage=$stage;cacheFiles=$cacheCount;cacheBytes=$cacheBytes;treeCpuSeconds=$cpu;treeWorkingSetBytes=$memory;shaderWorkers=$shaders;idleSeconds=($timer.Elapsed.TotalSeconds-$lastProgress);windowHandle=$root.MainWindowHandle.ToInt64();windowTitle=$root.MainWindowTitle;reviewDue=($timer.Elapsed.TotalSeconds -gt $DeadlineSeconds)}|ConvertTo-Json|Set-Content (Join-Path $evidence 'progress.json')
    if($timer.Elapsed.TotalSeconds-$lastProgress -gt 120){$result='stopped: no CPU, cache or log progress for 120 seconds';break}
    if($root.MainWindowHandle -ne [IntPtr]::Zero -and (Test-Path -LiteralPath $log) -and (($Mode -eq 'editor' -and $root.MainWindowTitle -match 'Unreal Editor') -or ($Mode -eq 'game' -and (Select-String -LiteralPath $log -Pattern 'PHILLY_SPAWN_GROUNDED' -Quiet)))){
     if($null -eq $readyAt){$readyAt=$timer.Elapsed.TotalSeconds;Write-Output 'Visible application window ready; checking 30 seconds of stable resources.'}
     if($timer.Elapsed.TotalSeconds-$readyAt -ge 30){$handoff=$true;$result=if($Mode -eq 'editor'){'editor ready; left open for user'}else{'game ready; left open for user'};break}
    }
   }
   if((Test-Path -LiteralPath $log) -and (Select-String -LiteralPath $log -Pattern 'Fatal error:|no writable nodes available|Unable to create or use cache graph|ZenLocal:|Launching executable.*zenserver' -Quiet)){$result='stopped: fatal error or unexpected cache resolution';break}
   $probe=Join-Path $projectRoot 'Saved/mechanics-probe.txt'
   if(!$InteractiveView -and (Test-Path -LiteralPath $probe) -and (Get-Item -LiteralPath $probe).LastWriteTimeUtc -ge $start){
    Start-Sleep -Seconds 2
    Copy-Item -LiteralPath $probe -Destination (Join-Path $evidence 'mechanics-probe.txt')
    foreach($name in @('mechanics-frame-sample.csv','walk-render-sample.csv','Screenshots/NativeDrivingProbe.png')){
     $file=Join-Path $projectRoot ('Saved/'+$name)
     if((Test-Path -LiteralPath $file) -and (Get-Item -LiteralPath $file).LastWriteTimeUtc -ge $start){Copy-Item -LiteralPath $file -Destination $evidence}
    }
    $probeText=Get-Content -LiteralPath $probe -Raw
    $result=if($probeText -match '^status=passed bounded probe only'){'probe completed'}else{'probe failed'};break
   }
  }
  Start-Sleep -Seconds 5
 }
} catch { $result='monitor error: '+$_.Exception.Message;Write-Output $result }
finally {
 # Preserve a natural exit code before cleanup can terminate anything.
 if($root -and $null -eq $exitCode){try{$state=Get-NativeExitState $root;if($state.hasExited){$exitCode=$state.exitCode}}catch{$result+='; exit-code capture failed: '+$_.Exception.Message}}
 # Kill only recorded descendants with matching creation times; protect PID reuse.
 if(!$handoff){foreach($entry in @($owned.GetEnumerator())){
  $proc=Get-Process -Id $entry.Key -ErrorAction SilentlyContinue
  if($proc){try{if($proc.StartTime.ToUniversalTime().Ticks -eq $entry.Value){Stop-Process -Id $proc.Id -ErrorAction Stop}}catch{Write-Output "Cleanup warning PID $($entry.Key): $_"}}
 }
 }
 $samples | Export-Csv -NoTypeInformation (Join-Path $evidence 'resources.csv')
 $remaining=@();foreach($entry in @($owned.GetEnumerator())){$proc=Get-Process -Id $entry.Key -ErrorAction SilentlyContinue;if($proc){try{if($proc.StartTime.ToUniversalTime().Ticks -eq $entry.Value){$remaining+=$proc.Id}}catch{}}}
 @{result=$result;exitCode=$exitCode;elapsedSeconds=$timer.Elapsed.TotalSeconds;peakWorkingSetBytes=$peak;leftOpenForUser=$handoff;remainingOwnedPids=$remaining;ownedPids=@($owned.Keys)} | ConvertTo-Json -Depth 3 | Tee-Object -FilePath (Join-Path $evidence 'result.json')
}

if(!($handoff -or ($Mode -eq 'build' -and $result -eq 'process exited: 0') -or ($Mode -eq 'game' -and $result -eq 'probe completed') -or ($InteractiveView -and $result -eq 'viewing deadline reached'))){throw "Native check failed: $result (exitCode=$exitCode). Evidence retained at $evidence"}
