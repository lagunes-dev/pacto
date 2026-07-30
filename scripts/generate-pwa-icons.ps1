Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $root "reference/demo-original"
$targetDirectory = Join-Path $root "public/icons"
New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null

function Save-Icon([string]$sourceName, [string]$targetName, [int]$size, [bool]$opaque) {
  $source = [System.Drawing.Image]::FromFile((Join-Path $sourceDirectory $sourceName))
  try {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      if ($opaque) {
        $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#0b100d"))
      } else {
        $graphics.Clear([System.Drawing.Color]::Transparent)
      }
      $graphics.DrawImage($source, 0, 0, $size, $size)
      $bitmap.Save((Join-Path $targetDirectory $targetName), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

Save-Icon "icon-192.png" "icon-192.png" 192 $false
Save-Icon "icon-512.png" "icon-512.png" 512 $false
Save-Icon "icon-512.png" "maskable-512.png" 512 $true
Save-Icon "icon-512.png" "apple-touch-icon.png" 180 $true
