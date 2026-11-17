# Saves the owner's LIVE Stripe restricted key (Media Masters LLC account) to .secrets/stripe-live.json
# without it appearing on screen, in chat, or in shell history. .secrets/ is git-ignored.
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\save-stripe-live-key.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root ".secrets\stripe-live.json"

$secure = Read-Host "Paste the live restricted key (starts with rk_live_), then press Enter" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if ($key -notmatch '^(rk|sk)_live_[A-Za-z0-9]+$') {
  Write-Host "That does not look like a live Stripe key (rk_live_... or sk_live_...). Nothing was saved." -ForegroundColor Red
  exit 1
}
$json = '{"STRIPE_LIVE_KEY":"' + $key + '","account":"Media Masters LLC","saved":"' + (Get-Date -Format s) + '"}'
[IO.File]::WriteAllText($out, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host ("Saved. Key ends in ..." + $key.Substring($key.Length - 4) + ". You can close this window.") -ForegroundColor Green
