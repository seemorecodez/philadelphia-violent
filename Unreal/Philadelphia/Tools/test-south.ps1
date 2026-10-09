param([switch]$NoWalk,[switch]$ArtReview,[switch]$NoBuildings,[switch]$NoStreetDetails,[switch]$LegacyDetailBudget,[switch]$GPUProfile,[switch]$DepthMaskedFoliage,[ValidateSet('south','museum','west','north','river','fairmount')][string]$Neighborhood='south',[ValidateRange(20,150)][int]$WalkMeters=20,[double]$TurnMeters=0,[double]$TurnYaw=0)
$ErrorActionPreference='Stop'
if($ArtReview){if($Neighborhood -ne 'museum'){throw 'Art review is museum-only'};$NoWalk=$true}
if($GPUProfile -and !$NoWalk){throw 'GPU profiling requires -NoWalk so synchronization cannot contaminate traversal timing'}
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$native=Join-Path $projectRoot 'Unreal/Philadelphia'
$output=Join-Path $projectRoot ('artifacts/unreal/'+$Neighborhood+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $output | Out-Null
if(Get-Process UnrealEditor -ErrorAction SilentlyContinue){throw 'An Unreal game/editor is already running'}
$battery=Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus
$charge=Get-CimInstance Win32_Battery
$start=Get-Date
@{started=$start.ToString('o');powerOnline=$battery.PowerOnline;batteryPercent=$charge.EstimatedChargeRemaining;resolution='1920x1080';internalPercentage=100;renderer='Forward, native development game';walkProbe=(!$NoWalk);buildingsEnabled=(!$NoBuildings);accepted=$false} | ConvertTo-Json | Set-Content (Join-Path $output 'settings.json')
$args=@(('"'+(Join-Path $native 'Philadelphia.uproject')+'"'),'/Game/Philadelphia/Maps/ChinatownEvaluation','-game','-windowed','-ResX=1920','-ResY=1080','-ForceRes','-NoVSync',('-PhillyNeighborhood='+$Neighborhood),'-PhillyEvaluation','-PhillyForwardSky','-ini:Engine:[/Script/Engine.RendererSettings]:r.ForwardShading=True','"-ExecCmds=r.ScreenPercentage 100,t.MaxFPS 0,r.DynamicGlobalIlluminationMethod 0,r.ReflectionMethod 2,r.Shadow.Virtual.Enable 0,r.AntiAliasingMethod 2"','-unattended','-nosplash','-nop4',('-abslog="'+(Join-Path $output 'game.log')+'"'))
if(!$NoWalk){$args+='-PhillyWalkProbe';$args+=('-PhillyWalkMeters='+$WalkMeters)}
if(!$NoWalk){$args+='-ini:Input:[/Script/Engine.InputSettings]:bShouldFlushPressedKeysOnViewportFocusLost=False'}
if($TurnMeters -gt 0){if($NoWalk -or $TurnMeters -ge $WalkMeters){throw 'Turn must lie within the requested walk'};$args+=('-PhillyWalkTurnMeters='+$TurnMeters);$args+=('-PhillyWalkTurnYaw='+$TurnYaw)}
if($ArtReview){$args+='-PhillyMuseumArtReview'}
if($NoBuildings){$args+='-PhillyNoHouses'}
if($NoStreetDetails){$args+='-PhillyNoStreetDetails'}
if($LegacyDetailBudget){$args+='-PhillyHouseDetailRadius=13000';$args+='-PhillyExtendedShadows'}
if($GPUProfile){$args+='-PhillyGPUProfile'}
if($DepthMaskedFoliage){
 $args+='-ini:Engine:[/Script/Engine.RendererSettings]:r.EarlyZPass=2'
 $args+='-ini:Engine:[/Script/Engine.RendererSettings]:r.EarlyZPassOnlyMaterialMasking=True'
}
@{streetDetailsEnabled=(!$NoStreetDetails);legacyDetailBudget=[bool]$LegacyDetailBudget;gpuProfile=[bool]$GPUProfile;depthMaskedFoliage=[bool]$DepthMaskedFoliage;walkMeters=$WalkMeters;turnMeters=$TurnMeters;turnYaw=$TurnYaw;focusFlushDisabled=(!$NoWalk)} | ConvertTo-Json | Set-Content (Join-Path $output 'street-settings.json')
$game=$null
try {
 $game=Start-Process -FilePath 'C:/Program Files/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor.exe' -ArgumentList $args -WindowStyle Hidden -PassThru
 Write-Output "Native Philadelphia $Neighborhood PID=$($game.Id); evidence=$output"
 $complete=$false
 for($i=0;$i -lt 100;$i++){
  Start-Sleep -Seconds 2
  if($game.HasExited){throw "Native game exited: $($game.ExitCode)"}
  $shot=Join-Path $native 'Saved/Screenshots/NativeChinatown.png'
  $frame=Join-Path $native 'Saved/native-frame-sample.csv'
  $walk=Join-Path $native 'Saved/walk-probe.txt'
  if((Test-Path $shot) -and (Test-Path $frame) -and (Get-Item $shot).LastWriteTime -gt $start -and (Get-Item $frame).LastWriteTime -gt $start -and ($NoWalk -or ((Test-Path $walk) -and (Get-Item $walk).LastWriteTime -gt $start))){$complete=$true;break}
 }
 if(!$complete){throw 'Native verification timed out; inspect the retained log'}
 Start-Sleep -Seconds 2
 foreach($pair in @(@('Screenshots/NativeChinatown.png','player.png'),@('native-frame-sample.csv','frame.csv'),@('native-gpu-sample.csv','gpu.csv'),@('walk-probe.txt','walk.txt'),@('walk-frame-sample.csv','walk-frame.csv'),@('walk-render-sample.csv','walk-render.csv'),@('Screenshots/NativeWalkProbe.png','walk.png'))){
  $path=Join-Path $native ('Saved/'+$pair[0]);if((Test-Path $path) -and (Get-Item $path).LastWriteTime -gt $start){Copy-Item -LiteralPath $path -Destination (Join-Path $output $pair[1])}
 }
 if($DepthMaskedFoliage){
  $log=Get-Content (Join-Path $output 'game.log') -Raw
  if($log -notmatch 'Set CVar \[\[r.EarlyZPassOnlyMaterialMasking:1\]\]' -or $log -notmatch 'Set CVar \[\[r.EarlyZPass:2\]\]'){throw 'Requested masked-depth settings were not confirmed by Unreal; this timing trial is invalid'}
 }
 Get-Content (Join-Path $output 'frame.csv')
 if(!$NoWalk){
  $walkResult=Get-Content (Join-Path $output 'walk.txt') -Raw
  Write-Output $walkResult
  if($walkResult -notmatch '^status=passed bounded probe only'){throw 'Native walking check failed; inspect the retained walk.txt and game.log'}
 }
} finally {if($game -and !$game.HasExited){Stop-Process -Id $game.Id;$game.WaitForExit(10000)|Out-Null}}
