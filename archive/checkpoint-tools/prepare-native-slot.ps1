param([switch]$VerifyOnly)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
$base=[IO.Path]::GetFullPath($PSScriptRoot)
$projectRoot=Join-Path $base 'native-slot/Philadelphia'
$config=Join-Path $projectRoot 'Config/DefaultEngine.ini'
$receipt=Join-Path $base 'evidence/setup-ready.json'
$cache=Join-Path $base 'ddc'
. (Join-Path $base 'native-slot-checks.ps1')
$null=Assert-NativeCacheRoot $cache
$enginePak='C:/Program Files/Epic Games/UE_5.7/Engine/DerivedDataCache/Compressed.ddp'
$graph='PhiladelphiaIsolatedDDC'
$begin='; BEGIN PHILADELPHIA ISOLATED SLOT CACHE'
$end='; END PHILADELPHIA ISOLATED SLOT CACHE'
$utf8=[Text.UTF8Encoding]::new($false)
function Assert-LocalPath([string]$Path){
 $full=[IO.Path]::GetFullPath($Path)
 if(!$full.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw "Path outside isolated checkpoint: $full"}
 $item=$full
 while($item -and $item.Length -ge $base.Length){
  if(Test-Path -LiteralPath $item){if((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Reparse point forbidden: $item"}}
  $parent=[IO.Path]::GetDirectoryName($item);if($parent -eq $item){break};$item=$parent
 }
 return $full
}
$null=Assert-LocalPath $config
$null=Assert-LocalPath $receipt
$null=Assert-LocalPath $cache
if(!(Test-Path -LiteralPath $config -PathType Leaf)){throw 'Isolated project config missing'}
if(!(Test-Path -LiteralPath $enginePak -PathType Leaf)){throw 'Existing read-only engine shader pak missing'}
$hashes=@{}
foreach($name in @('prepare-native-slot.ps1','run-native-slot.ps1','native-build.ps1','native-slot-checks.ps1')){
 $path=Join-Path $base $name
 $tokens=$null;$errors=$null
 [Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)|Out-Null
 if($errors.Count){throw "Invalid PowerShell syntax: $name"}
 $hashes[$name]=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
}
$cacheIni=Assert-NativeCacheRoot $cache
$blocks=@($begin)
foreach($section in @($graph,'InstalledDerivedDataBackendGraph','DerivedDataBackendGraph')){
 $blocks+=@("[$section]",'Root=(Type=Hierarchical, Inner=EnginePak, Inner=Local)',('EnginePak=(Type=ReadPak, Filename="'+$enginePak+'", Compressed=true)'),('Local=(Type=FileSystem, ReadOnly=false, DeleteOnly=false, Clean=false, Flush=false, DeleteUnused=false, Path="'+$cacheIni+'")'),'')
}
$blocks+=$end
$block=$blocks -join "`n"
$raw=[IO.File]::ReadAllText($config)
if(!$VerifyOnly){
 # A failed preparation must invalidate an older successful receipt first.
 if(Test-Path -LiteralPath $receipt){Remove-Item -LiteralPath $receipt -Force}
 $backup=Join-Path $base 'evidence/DefaultEngine.before-cache.ini'
 if(!(Test-Path -LiteralPath $backup)){[IO.File]::WriteAllBytes($backup,[IO.File]::ReadAllBytes($config))}
 if($raw.Contains($begin)){
  $pattern='(?s)'+[regex]::Escape($begin)+'.*?'+[regex]::Escape($end)
  if([regex]::Matches($raw,$pattern).Count -ne 1){throw 'Invalid or duplicate managed cache block'}
  $raw=[regex]::Replace($raw,$pattern,{param($m) $block})
 }else{$raw=$raw.TrimEnd()+"`n`n"+$block+"`n"}
 [IO.File]::WriteAllText($config,$raw,$utf8)
}
if(!$raw.Contains($block)){throw 'Expected local-only cache block missing or changed'}
# Project values override BaseEngine.ini; resolve the exact graph keys statically.
$sections=@{};$section=''
foreach($line in $raw -split '\r?\n'){
 $line=$line.Trim();if(!$line -or $line.StartsWith(';')){continue}
 if($line -match '^\[(.+)\]$'){$section=$Matches[1];if(!$sections.ContainsKey($section)){$sections[$section]=@{}};continue}
 if($section -and $line -match '^([^=]+)=(.*)$'){$sections[$section][$Matches[1].Trim()]=$Matches[2].Trim()}
}
foreach($name in @($graph,'InstalledDerivedDataBackendGraph','DerivedDataBackendGraph')){
 if($sections[$name]['Root'] -ne 'Root=(Type=Hierarchical, Inner=EnginePak, Inner=Local)'.Substring(5)){throw "Unexpected resolved root: $name"}
 if($sections[$name]['Local'] -ne ('(Type=FileSystem, ReadOnly=false, DeleteOnly=false, Clean=false, Flush=false, DeleteUnused=false, Path="'+$cacheIni+'")')){throw "Unexpected resolved local node: $name"}
 if($sections[$name]['EnginePak'] -ne ('(Type=ReadPak, Filename="'+$enginePak+'", Compressed=true)')){throw "Unexpected engine pak: $name"}
}
$actualHash=(Get-FileHash -LiteralPath $config -Algorithm SHA256).Hash
if($VerifyOnly){
 if(!(Test-Path -LiteralPath $receipt)){throw 'No successful setup receipt; refusing launch'}
 $saved=Get-Content -LiteralPath $receipt -Raw -Encoding utf8|ConvertFrom-Json
 if($saved.configSha256 -ne $actualHash -or $saved.cachePath -ne $cache -or $saved.graph -ne $graph){throw 'Setup receipt/config mismatch'}
 foreach($name in $hashes.Keys){if($saved.scriptSha256.$name -ne $hashes[$name]){throw "Setup script changed after preparation: $name"}}
}
New-Item -ItemType Directory -Path $cache -Force|Out-Null
$null=Assert-LocalPath $cache
$probe=Join-Path $cache ('write-check-'+[guid]::NewGuid().ToString('N')+'.tmp')
$renamed=$probe+'.verified'
try{
 $stream=[IO.File]::Open($probe,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
 try{$payload=[Text.Encoding]::UTF8.GetBytes('Philadelphia local cache write/read/rename check');$stream.Write($payload,0,$payload.Length);$stream.Flush($true)}finally{$stream.Dispose()}
 if([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($probe)) -ne 'Philadelphia local cache write/read/rename check'){throw 'Cache probe readback mismatch'}
 Move-Item -LiteralPath $probe -Destination $renamed
}finally{foreach($path in @($probe,$renamed)){if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}}}
# Privacy overrides are applied only to a future game process, not global settings.
$privacy=@('-ini:EditorSettings:[/Script/UnrealEd.CrashReportsPrivacySettings]:bSendUnattendedBugReports=False','-ini:EditorSettings:[/Script/UnrealEd.AnalyticsPrivacySettings]:bSendUsageData=False')
$result=[ordered]@{status='safe setup checks passed; Unreal not started';checkedUtc=[DateTime]::UtcNow.ToString('o');graph=$graph;cachePath=$cache;cacheRootLength=$cacheIni.Length;cacheRootExclusiveLimit=119;configSha256=$actualHash;scriptSha256=$hashes;enginePak=$enginePak;resolvedRootNodes=@('EnginePak: read-only','Local: workspace filesystem read/write');fallbackGraphsLocalOnly=$true;writeReadRenameDeletePassed=$true;privacyArguments=$privacy;runtimeConfigVerified=$false;pauseLockPresent=(Test-Path -LiteralPath (Join-Path $base 'NATIVE-SLOT-PAUSED'))}
if(!$VerifyOnly){[IO.File]::WriteAllText($receipt,($result|ConvertTo-Json -Depth 5),$utf8)}
[pscustomobject]$result
