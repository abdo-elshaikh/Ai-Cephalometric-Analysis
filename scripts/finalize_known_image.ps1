param(
    [string]$Email,
    [string]$Password,
    [string]$ImageId
)

$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5180'

$auth = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' -Body (@{ email = $Email; password = $Password } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($auth.accessToken)" }

try {
    $null = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/full-pipeline/$ImageId?type=Steiner" -Headers $headers
}
catch {
    # Continue using latest session even if this call is transiently unavailable.
}

$latest = Invoke-RestMethod -Method Get -Uri "$base/api/analysis/latest-session/$ImageId" -Headers $headers
$sessionId = $latest.id
Write-Output "sessionId=$sessionId"

$landmarks = Invoke-RestMethod -Method Get -Uri "$base/api/analysis/sessions/$sessionId/landmarks" -Headers $headers
$finalizePayload = @($landmarks | ForEach-Object {
    [pscustomobject]@{
        landmarkCode = $_.landmarkCode
        x = [decimal]$_.xPx
        y = [decimal]$_.yPx
    }
}) | ConvertTo-Json -Depth 8

$finalized = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/sessions/$sessionId/finalize" -Headers $headers -ContentType 'application/json' -Body $finalizePayload

# Ensure overlays are generated synchronously (best-effort), then fetch stored overlay URLs.
try {
    $null = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/sessions/$sessionId/overlays" -Headers $headers
}
catch {
    Write-Output 'overlay generation endpoint returned non-success; continuing to fetch any available overlays.'
}
$overlays = Invoke-RestMethod -Method Get -Uri "$base/api/analysis/sessions/$sessionId/overlays" -Headers $headers

$reportReq = @{
    includesXray = $true
    includesLandmarkOverlay = $true
    includesMeasurements = $true
    includesTreatmentPlan = $true
    language = 'en'
} | ConvertTo-Json

$report = Invoke-RestMethod -Method Post -Uri "$base/api/reports/sessions/$sessionId" -Headers $headers -ContentType 'application/json' -Body $reportReq
$reports = Invoke-RestMethod -Method Get -Uri "$base/api/reports/sessions/$sessionId" -Headers $headers

[pscustomobject]@{
    imageId = $ImageId
    sessionId = $sessionId
    status = $finalized.session.status
    landmarks = @($finalized.landmarks).Count
    measurements = @($finalized.measurements).Count
    diagnosis = ($null -ne $finalized.diagnosis)
    treatments = @($finalized.treatments).Count
    overlayCount = @($overlays).Count
    reportId = $report.id
    reportsCount = @($reports).Count
} | ConvertTo-Json -Depth 8
