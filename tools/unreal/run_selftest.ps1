# Plays The Stormworks Escape in the real game (standalone, rendered) with the scripted self-test,
# waits for it to quit, and prints the results. Screenshots and results.txt end up in
# <Project>/Saved/StormworksSelfTest/.
#
#   powershell -File tools/unreal/run_selftest.ps1 [-Project <path to .uproject>] [-Engine <UE root>]
#       [-Clip] [-ExecCmds "r.VolumetricFog 0"]
#
# -Clip also saves a frame every 0.1 s through the climax (Saved/StormworksSelfTest/clip/), for
# tools/unreal/make_clip.py. It slows the run down: do not read frame times from a -Clip run.
param(
    [string]$Project = "$PSScriptRoot\..\..\..\ItTakesOne-Unreal\e\e.uproject",
    [string]$Engine = 'C:\Program Files\Epic Games\UE_5.8',
    [int]$Width = 1280,
    [int]$Height = 720,
    [switch]$Clip,
    [string]$ExecCmds = ''
)
$Project = (Resolve-Path $Project).Path
$editor = Join-Path $Engine 'Engine\Binaries\Win64\UnrealEditor.exe'
$results = Join-Path (Split-Path $Project) 'Saved\StormworksSelfTest\results.txt'
$started = Get-Date
$cmds = 'DisableAllScreenMessages'
if ($ExecCmds) { $cmds = "$cmds,$ExecCmds" }
$arguments = @(
    "`"$Project`"", '/Game/ItTakesOne/Maps/Stormworks', '-game', '-windowed',
    "-ResX=$Width", "-ResY=$Height", '-StormSelfTest', '-log', '-nosplash',
    "-ExecCmds=`"$cmds`"")
if ($Clip) { $arguments += '-StormClip' }
$p = Start-Process -FilePath $editor -PassThru -ArgumentList $arguments
$p.WaitForExit()
"game exited ($($p.ExitCode)) after $([int]((Get-Date) - $started).TotalSeconds) s"
if ((Test-Path $results) -and (Get-Item $results).LastWriteTime -gt $started) {
    Get-Content $results
} else {
    'no fresh results: see <Project>/Saved/Logs'
}
