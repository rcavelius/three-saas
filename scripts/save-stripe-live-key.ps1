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
# Keep everything else already in the file (webhook secrets and ids); only the key and the date change.
$data = [ordered]@{}
if (Test-Path $out) {
  $existing = [IO.File]::ReadAllText($out) | ConvertFrom-Json
  foreach ($p in $existing.PSObject.Properties) { $data[$p.Name] = $p.Value }
}
$data["STRIPE_LIVE_KEY"] = $key
$data["account"] = "Media Masters LLC"
$data["saved"] = (Get-Date -Format s)
$json = New-Object PSObject -Property $data | ConvertTo-Json -Compress
[IO.File]::WriteAllText($out, $json, (New-Object Text.UTF8Encoding($false)))
Write-Host ("Saved. Key ends in ..." + $key.Substring($key.Length - 4) + ". You can close this window.") -ForegroundColor Green
