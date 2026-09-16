param(
 [Parameter(Mandatory=$true)][string]$Name,
 [Parameter(Mandatory=$true)][string]$Entry,
 [Parameter(Mandatory=$true)][string]$WorkingDirectory,
 [Parameter(Mandatory=$true)][string]$ServiceDirectory,
 [string[]]$NodeArguments=@(),
 [switch]$Periodic,
 [switch]$DiscardOutput
)
$ErrorActionPreference='Stop'
$Entry=(Resolve-Path -LiteralPath $Entry).Path
$node=(Get-Command node.exe).Source
New-Item -ItemType Directory -Path $ServiceDirectory -Force|Out-Null
$runner=Join-Path $ServiceDirectory 'run.ps1'
$launcher=Join-Path $ServiceDirectory 'run-hidden.vbs'
$log=Join-Path $ServiceDirectory 'service.log'
$quoted=((@($Entry)+$NodeArguments)|ForEach-Object {"'"+$_.Replace("'","''")+"'"}) -join ','
$outputLine=if($DiscardOutput){"& '$node' @a *> `$null"}else{"& '$node' @a *>> '$log'"}
$script=@"
# PowerShell 5 promotes native stderr to ErrorRecords; keep the supervisor alive and trust the child exit code.
`$ErrorActionPreference='Continue'
Set-Location -LiteralPath '$($WorkingDirectory.Replace("'","''"))'
if((Test-Path '$log') -and (Get-Item '$log').Length -gt 5242880){Move-Item '$log' '$log.previous' -Force}
`$a=@($quoted)
$outputLine
exit `$LASTEXITCODE
"@
[IO.File]::WriteAllText($runner,$script,[Text.UTF8Encoding]::new($true))
$command='"'+$env:SystemRoot+'\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$runner+'"'
$vbs='Option Explicit'+"`r`n"+'Dim shell, rc'+"`r`n"+'Set shell = CreateObject("WScript.Shell")'+"`r`n"+'rc = shell.Run("'+$command.Replace('"','""')+'", 0, True)'+"`r`n"+'WScript.Quit rc'+"`r`n"
[IO.File]::WriteAllText($launcher,$vbs,[Text.UTF8Encoding]::new($false))
$action=New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wscript.exe" -Argument ('"'+$launcher+'"') -WorkingDirectory $WorkingDirectory
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
if($Periodic){$triggers=@(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1));$limit=New-TimeSpan -Minutes 30}
else{$triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $principal.UserId),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)));$limit=[TimeSpan]::Zero}
$settings=New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit $limit
Register-ScheduledTask -TaskName $Name -Action $action -Principal $principal -Trigger $triggers -Settings $settings -Description 'Independent Moustachi service; WScript invisible launcher.' -Force|Out-Null
Disable-ScheduledTask -TaskName $Name|Out-Null
Write-Output "Registered disabled task: $Name. Enable/start only after cutover checks."
