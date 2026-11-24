# Publishes ONE spreadsheet template to the GridRinse shop, end to end, from the private digital-products folder.
# Runs only where that folder and the Cloudflare/Stripe credentials exist (the owner's PC). Never commits paid files.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\templates\publish-template.ps1 -Slug <slug> `
#     [-ProductsRoot C:\Users\rcave\Desktop\digital-products] [-SkipStripe]
#
# Steps (stops at the first failure):
#   0. refuse while a game is running (this is also the owner's gaming PC)
#   1. build/verify.ps1 -Slug: recalculates both workbooks in hidden Excel, fails on ANY error value, exports the
#      screenshot PDFs (the "real, tested .xlsx" gate)
#   2. render_shots.py, make_guides.py, compose_images.py, write_listings.py for the slug (images need _scenes/a.png and
#      b.png from Higgsfield first; see AGENT.md)
#   3. upload-template-files.mjs: Excel + Google Sheets + PDF guide to the private KV namespace; manifest updated
#   4. make-template-images.py + extract-template-data.py: WebP marketing images and page data in apps/gridrinse
#   5. setup-stripe-templates.mts in LIVE mode (product + price; never charges) unless -SkipStripe
# Afterwards the caller adds the template's SEO entry to apps/gridrinse/src/content/templates.ts, runs the tests and ships.
param(
  [Parameter(Mandatory = $true)][string]$Slug,
  [string]$ProductsRoot = "C:\Users\rcave\Desktop\digital-products",
  [switch]$SkipStripe
)
$ErrorActionPreference = "Stop"
$repo = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if ($Slug -notmatch '^[a-z0-9][a-z0-9-]{1,60}$') { throw "bad slug $Slug" }

function Assert-NoGame {
  $g = Get-Process | Where-Object { $_.Name -like "Warcraft III*" -or ($_.Path -and ($_.Path -match 'steamapps\\common' -or $_.Path -match 'Epic Games')) }
  if ($g) { throw "A game is running ($($g[0].Name)): not doing heavy work now. Try again later." }
}
function Invoke-Step([string]$name, [scriptblock]$body) {
  Write-Host "== $name"
  & $body
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

# Credentials from the git-ignored .secrets folder of the main checkout (never printed).
$secrets = Join-Path (Split-Path (Split-Path (Split-Path $repo))) ".secrets"
if (-not (Test-Path $secrets)) { $secrets = Join-Path $repo ".secrets" }
if (-not (Test-Path (Join-Path $secrets "cloudflare.json"))) { throw "no .secrets/cloudflare.json found" }

Assert-NoGame
$prod = Join-Path $ProductsRoot "products\$Slug"
if (-not (Test-Path (Join-Path $prod "_build.json"))) { throw "$prod has no _build.json: build it first (python build\build_all.py $Slug)" }

Push-Location $ProductsRoot
try {
  Invoke-Step "verify in Excel (0 formula errors)" { powershell -NoProfile -ExecutionPolicy Bypass -File build\verify.ps1 -Slug $Slug }
  Assert-NoGame
  Invoke-Step "screenshots" { python build\render_shots.py $Slug }
  Invoke-Step "quick-start guide" { python build\make_guides.py $Slug }
  if (-not ((Test-Path (Join-Path $prod "_scenes\a.png")) -and (Test-Path (Join-Path $prod "_scenes\b.png")))) {
    throw "missing $prod\_scenes\a.png and b.png (Higgsfield lifestyle backgrounds, see AGENT.md)"
  }
  Invoke-Step "listing images" { python build\compose_images.py $Slug }
  Invoke-Step "listing data" { python build\write_listings.py $Slug }
} finally { Pop-Location }

Push-Location $repo
try {
  $cf = Get-Content -Raw -Encoding UTF8 (Join-Path $secrets "cloudflare.json") | ConvertFrom-Json
  $env:CLOUDFLARE_API_TOKEN = $cf.CLOUDFLARE_API_TOKEN
  $env:CLOUDFLARE_ACCOUNT_ID = $cf.CLOUDFLARE_ACCOUNT_ID
  try {
    Invoke-Step "upload paid files to private KV" { node scripts\templates\upload-template-files.mjs (Join-Path $ProductsRoot "products") $Slug }
  } finally { Remove-Item Env:CLOUDFLARE_API_TOKEN, Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue }
  Invoke-Step "WebP images" { python -I scripts\templates\make-template-images.py (Join-Path $ProductsRoot "products") $Slug }
  Invoke-Step "page data" { python -I scripts\templates\extract-template-data.py (Join-Path $ProductsRoot "products") $Slug }
  if (-not $SkipStripe) {
    $st = Get-Content -Raw -Encoding UTF8 (Join-Path $secrets "stripe-live.json") | ConvertFrom-Json
    $env:STRIPE_SECRET_KEY = $st.STRIPE_LIVE_KEY
    $env:STRIPE_LIVE_SETUP_APPROVED = "yes"
    try {
      # Needs the template's entry in templates.ts first; without it this only re-checks the existing ones.
      Invoke-Step "live Stripe product and price" { npx tsx scripts\templates\setup-stripe-templates.mts }
    } finally { Remove-Item Env:STRIPE_SECRET_KEY, Env:STRIPE_LIVE_SETUP_APPROVED -ErrorAction SilentlyContinue }
  }
} finally { Pop-Location }
Write-Host "Published files and page data for $Slug. Next: add its entry to apps/gridrinse/src/content/templates.ts, run the tests, ship."
