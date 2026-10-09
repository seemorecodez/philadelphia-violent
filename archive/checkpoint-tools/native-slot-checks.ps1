Set-StrictMode -Version Latest
function Assert-NativeCacheRoot([string]$Path){
 $normalized=[IO.Path]::GetFullPath($Path).Replace('\','/')
 if($normalized.Length -ge 119){throw "Unreal cache root must be shorter than 119 characters; got $($normalized.Length): $normalized"}
 return $normalized
}
function Get-NativeWorkingSetBytes([AllowEmptyCollection()][object[]]$Processes){
 [long]$total=0
 foreach($process in $Processes){
  if($null -eq $process){throw 'Null process in resource sample'}
  [long]$value=$process.WorkingSet64
  if($value -lt 0){throw 'Invalid negative working set'}
  $total+=$value
 }
 return $total
}
function Get-NativeExitState([object]$Process){
 $Process.Refresh()
 if(!$Process.HasExited){return [pscustomobject]@{hasExited=$false;exitCode=$null}}
 $Process.WaitForExit()
 $code=$Process.ExitCode
 if($null -eq $code){throw 'Exited process has no exit code; cannot classify as success'}
 return [pscustomobject]@{hasExited=$true;exitCode=[int]$code}
}
