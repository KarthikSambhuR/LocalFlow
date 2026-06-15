$repo = "KarthikSambhuR/LocalFlow"
$tempPath = "$env:TEMP\LocalFlowSetup.exe"

# 1. Fetch the download URL for the latest release asset
Write-Host "Fetching latest release details from GitHub..." -ForegroundColor Cyan
$releaseUrl = "https://api.github.com/repos/$repo/releases/latest"
try {
    $latestRelease = Invoke-RestMethod -Uri $releaseUrl -UseBasicParsing
    $asset = $latestRelease.assets | Where-Object { $_.name -ieq "LocalFlowSetup.exe" }
    if (-not $asset) {
        Write-Error "Could not find LocalFlowSetup.exe in the latest release assets."
        return
    }
    $downloadUrl = $asset.browser_download_url
} catch {
    Write-Error "Failed to fetch release details: $_"
    return
}

# 2. Download the installer
Write-Host "Downloading LocalFlow installer from $downloadUrl..." -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempPath -UseBasicParsing
} catch {
    Write-Error "Failed to download installer: $_"
    return
}

# 3. Unblock the file to bypass Windows SmartScreen warnings
Write-Host "Unblocking file to bypass Windows SmartScreen..." -ForegroundColor Cyan
Unblock-File -Path $tempPath

# 4. Execute the installer
Write-Host "Launching LocalFlow Installer..." -ForegroundColor Green
Start-Process -FilePath $tempPath -Wait

Write-Host "Done!" -ForegroundColor Green
