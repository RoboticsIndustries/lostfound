# Starts the Lost & Found server on Windows. Run it by double-clicking start.bat.
# The first run downloads PocketBase (about 15 MB) into .\bin.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$Version = '0.40.5'
$Port = if ($env:PORT) { $env:PORT } else { 8090 }
$Exe = Join-Path $PSScriptRoot 'bin\pocketbase.exe'

if (-not (Test-Path $Exe)) {
  $Arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
  $Zip = Join-Path $PSScriptRoot 'bin\pb.zip'
  New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'bin') | Out-Null
  Write-Host "Downloading PocketBase $Version (windows/$Arch)..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -OutFile $Zip `
    -Uri "https://github.com/pocketbase/pocketbase/releases/download/v$Version/pocketbase_${Version}_windows_$Arch.zip"
  Expand-Archive -Path $Zip -DestinationPath (Join-Path $PSScriptRoot 'bin') -Force
  Remove-Item $Zip
}

if (-not (Test-Path 'pb_public\index.html')) {
  Write-Host 'Warning: pb_public\ has no web app. Download the release zip, or run scripts/package.sh to build it.'
}

# The address other devices on the network use (shown to admins on the School tab).
$Ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1).IPAddress
if (-not $Ip) { $Ip = 'localhost' }
$env:LF_ADDRESS = "http://${Ip}:$Port"

Write-Host ''
Write-Host '  Lost & Found is running.'
Write-Host "    On this computer:        http://localhost:$Port"
Write-Host "    Phones and other PCs:    $($env:LF_ADDRESS)   (same Wi-Fi / network)"
Write-Host ''
Write-Host '  Keep this window open. Close it to stop.'
Write-Host '  If Windows Firewall asks, allow access on private networks.'
Write-Host ''

# First run: open the setup page in the browser.
if (-not (Test-Path 'pb_data')) {
  Start-Job -ScriptBlock { Start-Sleep 2; Start-Process "http://localhost:$using:Port" } | Out-Null
}

& $Exe serve --http "0.0.0.0:$Port" --dir pb_data --hooksDir pb_hooks --migrationsDir pb_migrations --publicDir pb_public
