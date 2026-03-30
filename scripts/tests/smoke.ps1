$ErrorActionPreference = 'Continue'
$base = if ($env:TEST_BACKEND_URL) { $env:TEST_BACKEND_URL } elseif ($env:BACKEND_URL) { $env:BACKEND_URL } else { 'http://localhost:5001' }
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$uname = 'smoke' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$password = 'password123'
$rows = @()

function AddRow([string]$t, [bool]$ok, [string]$d) {
  $script:rows += [PSCustomObject]@{
    Test = $t
    Status = if ($ok) { 'PASS' } else { 'FAIL' }
    Details = $d
  }
}

try {
  $regBody = @{ username = $uname; password = $password; name = 'Smoke User' } | ConvertTo-Json
  $reg = Invoke-RestMethod -Method Post -Uri "$base/api/auth/register" -WebSession $session -ContentType 'application/json' -Body $regBody
  AddRow 'Auth Register' ($null -ne $reg.userId) ("userId=$($reg.userId)")
} catch {
  AddRow 'Auth Register' $false $_.Exception.Message
}

try {
  $loginBody = @{ username = $uname; password = $password } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -WebSession $session -ContentType 'application/json' -Body $loginBody
  AddRow 'Auth Login' ($null -ne $login.userId) ("userId=$($login.userId)")
} catch {
  AddRow 'Auth Login' $false $_.Exception.Message
}

$roomCode = $null
try {
  $create = Invoke-RestMethod -Method Post -Uri "$base/api/room/create" -WebSession $session -ContentType 'application/json' -Body (@{ subject = 'reading'; difficulty = 'easy' } | ConvertTo-Json)
  $roomCode = $create.roomCode
  AddRow 'Room Create' (($null -ne $roomCode) -and ($roomCode.Length -eq 6)) ("roomCode=$roomCode")
} catch {
  AddRow 'Room Create' $false $_.Exception.Message
}

try {
  if ($roomCode) {
    $room = Invoke-RestMethod -Method Get -Uri "$base/api/room/$roomCode" -WebSession $session
    AddRow 'Room Get' ($room.roomCode -eq $roomCode) ("players=$($room.players.Count)")
  } else {
    AddRow 'Room Get' $false 'Skipped: no room code'
  }
} catch {
  AddRow 'Room Get' $false $_.Exception.Message
}

$checks = @(
  @{ Name = 'Room Active Route'; Path = '/api/room/active' },
  @{ Name = 'Dashboard Weekly Streak'; Path = '/api/dashboard/weekly-streak' },
  @{ Name = 'Dashboard Wrong Questions Review'; Path = '/api/dashboard/wrong-questions-review' },
  @{ Name = 'Live Boss Teaser'; Path = '/api/live-boss-teaser' }
)

foreach ($c in $checks) {
  try {
    $r = Invoke-WebRequest -Method Get -Uri ($base + $c.Path) -WebSession $session -UseBasicParsing
    AddRow $c.Name ($r.StatusCode -eq 200) ("status=$($r.StatusCode)")
  } catch {
    if ($_.Exception.Response) {
      AddRow $c.Name $false ("status=$([int]$_.Exception.Response.StatusCode)")
    } else {
      AddRow $c.Name $false $_.Exception.Message
    }
  }
}

try {
  $wsScript = Join-Path $PSScriptRoot 'test-websocket.js'
  $wsOut = node $wsScript | Out-String
  $ok = ($wsOut -match 'Connected to WebSocket server') -and ($wsOut -match 'Room created:')
  AddRow 'WebSocket Smoke' $ok (($wsOut -replace "`r`n", ' | ').Trim())
} catch {
  AddRow 'WebSocket Smoke' $false $_.Exception.Message
}

try {
  if ($roomCode) {
    $leave = Invoke-RestMethod -Method Post -Uri "$base/api/room/leave" -WebSession $session -ContentType 'application/json' -Body (@{ roomCode = $roomCode } | ConvertTo-Json)
    AddRow 'Room Leave' ($null -ne $leave.message) ("message=$($leave.message)")
  } else {
    AddRow 'Room Leave' $false 'Skipped: no room code'
  }
} catch {
  AddRow 'Room Leave' $false $_.Exception.Message
}

$rows | ConvertTo-Json -Depth 5