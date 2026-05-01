param(
    [string]$Email = 'doctor@ceph.local',
    [string]$Password = 'Doctor@123'
)

$ErrorActionPreference = 'Stop'

$base = 'http://localhost:5180'
$email = $Email
$pass = $Password
$imagePath = 'D:\Ai_Ceph_Project\Ai Cephalometric Analysis\test.jpg'

if (-not (Test-Path $imagePath)) {
    throw "Image not found: $imagePath"
}

Write-Output 'STEP login'
$auth = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' -Body (@{ email = $email; password = $pass } | ConvertTo-Json)
$token = $auth.accessToken
if (-not $token) {
    throw 'Login failed: no access token returned.'
}
$headers = @{ Authorization = "Bearer $token" }

Write-Output 'STEP studies'
$studies = Invoke-RestMethod -Method Get -Uri "$base/api/studies" -Headers $headers
if (-not $studies -or $studies.Count -eq 0) {
    Write-Output 'No studies found. Creating patient and study...'

    $patientReq = @{
        firstName = 'Pipeline'
        lastName = 'Case'
        dateOfBirth = '2012-01-01'
        gender = 'Female'
        phone = '+20-100-000-0000'
        email = 'pipeline.case@example.com'
        notes = 'Auto-created for pipeline completion.'
    } | ConvertTo-Json

    $patient = Invoke-RestMethod -Method Post -Uri "$base/api/patients" -Headers $headers -ContentType 'application/json' -Body $patientReq

    $studyReq = @{
        patientId = $patient.id
        studyType = 'Lateral'
        title = 'Automated Full Pipeline Study'
        clinicalNotes = 'Created for upload/pipeline/finalize/report sequence.'
        studyDate = (Get-Date).ToString('yyyy-MM-dd')
    } | ConvertTo-Json

    $createdStudy = Invoke-RestMethod -Method Post -Uri "$base/api/studies" -Headers $headers -ContentType 'application/json' -Body $studyReq
    $studies = @($createdStudy)
}
$study = $studies | Select-Object -First 1
$studyId = $study.id
Write-Output "studyId=$studyId"

Write-Output 'STEP upload'
# Windows PowerShell 5.1 does not support -Form on Invoke-RestMethod.
Add-Type -AssemblyName System.Net.Http
$http = New-Object System.Net.Http.HttpClient
$http.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $token)

$multipart = New-Object System.Net.Http.MultipartFormDataContent
$fileBytes = [System.IO.File]::ReadAllBytes($imagePath)
$fileContent = New-Object System.Net.Http.ByteArrayContent(,$fileBytes)
$fileContent.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue('image/jpeg')
$multipart.Add($fileContent, 'file', [System.IO.Path]::GetFileName($imagePath))

$uploadResponse = $http.PostAsync("$base/api/images/study/$studyId", $multipart).GetAwaiter().GetResult()
if (-not $uploadResponse.IsSuccessStatusCode) {
    $uploadError = $uploadResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    throw "Upload failed: $($uploadResponse.StatusCode) $uploadError"
}

$uploadJson = $uploadResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
$upload = $uploadJson | ConvertFrom-Json
$imageId = $upload.id
if (-not $imageId) {
    throw 'Upload did not return image id.'
}
Write-Output "imageId=$imageId"

if ($upload.storageUrl) {
    Write-Output 'STEP wait-for-upload-file'
    $fileReady = $false
    $fileUrl = if ($upload.storageUrl.StartsWith('http')) { $upload.storageUrl } else { "$base$($upload.storageUrl)" }

    for ($i = 1; $i -le 40 -and -not $fileReady; $i++) {
        try {
            $probe = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $fileUrl -Headers $headers
            if ($probe.StatusCode -ge 200 -and $probe.StatusCode -lt 300) {
                $fileReady = $true
            }
        }
        catch {
            # Continue probing without delay; this loop also acts as a short warm-up window.
        }
    }

    if (-not $fileReady) {
        Write-Output 'warning: uploaded file URL not confirmed yet; continuing anyway.'
    }
}

Write-Output 'STEP full-pipeline'
$pipeline = $null

for ($i = 1; $i -le 3 -and $null -eq $pipeline; $i++) {
    try {
        Write-Output "full-pipeline attempt $i"
        $pipeline = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/full-pipeline/$imageId?type=Steiner" -Headers $headers
    }
    catch {
        Write-Output "full-pipeline attempt $i failed"
    }
}

if ($null -eq $pipeline) {
    Write-Output 'full-pipeline failed, falling back to step-by-step endpoints...'

    # 1) Detect landmarks
    $detect = $null
    for ($i = 1; $i -le 3 -and $null -eq $detect; $i++) {
        try {
            Write-Output "detect attempt $i"
            $detect = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/detect/$imageId?type=Steiner" -Headers $headers
        }
        catch {
            Write-Output "detect attempt $i failed"
        }
    }
    if ($null -eq $detect) {
        throw 'Detect endpoint failed after retries.'
    }

    # 2) Resolve latest session for this image
    $latestSession = Invoke-RestMethod -Method Get -Uri "$base/api/analysis/latest-session/$imageId" -Headers $headers
    $fallbackSessionId = $latestSession.id

    # 3) Measurements -> diagnosis -> treatment
    $meas = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/sessions/$fallbackSessionId/measurements" -Headers $headers
    $diag = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/sessions/$fallbackSessionId/diagnosis" -Headers $headers
    $treat = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/sessions/$fallbackSessionId/treatment" -Headers $headers

    $pipeline = [pscustomobject]@{
        session = $latestSession
        landmarks = @($detect)
        measurements = @($meas)
        diagnosis = $diag
        treatments = @($treat)
    }
}

$sessionId = $pipeline.session.id
if (-not $sessionId) {
    throw 'Full pipeline did not return session id.'
}
Write-Output "sessionId=$sessionId"

$lmRaw = @($pipeline.landmarks)
if ($lmRaw.Count -eq 0) {
    throw 'No landmarks returned from full pipeline.'
}
Write-Output "landmarksCount=$($lmRaw.Count)"

$landmarksForFinalize = foreach ($lm in $lmRaw) {
    $code = $lm.landmarkCode
    if (-not $code) { $code = $lm.name }
    if (-not $code) { $code = $lm.landmarkName }

    $x = $lm.x
    if ($null -eq $x) { $x = $lm.xPx }
    $y = $lm.y
    if ($null -eq $y) { $y = $lm.yPx }

    [pscustomobject]@{
        landmarkCode = $code
        x = [decimal]$x
        y = [decimal]$y
    }
}

Write-Output 'STEP finalize'
$finalized = Invoke-RestMethod -Method Post -Uri "$base/api/analysis/sessions/$sessionId/finalize" -Headers $headers -ContentType 'application/json' -Body ($landmarksForFinalize | ConvertTo-Json -Depth 8)
Write-Output "finalStatus=$($finalized.session.status)"

Write-Output 'STEP overlays'
$overlays = Invoke-RestMethod -Method Get -Uri "$base/api/analysis/sessions/$sessionId/overlays" -Headers $headers
Write-Output "overlayCount=$(@($overlays).Count)"

Write-Output 'STEP report'
$reportReq = @{
    includesXray = $true
    includesLandmarkOverlay = $true
    includesMeasurements = $true
    includesTreatmentPlan = $true
    language = 'en'
} | ConvertTo-Json
$report = Invoke-RestMethod -Method Post -Uri "$base/api/reports/sessions/$sessionId" -Headers $headers -ContentType 'application/json' -Body $reportReq
Write-Output "reportId=$($report.id)"

$reports = Invoke-RestMethod -Method Get -Uri "$base/api/reports/sessions/$sessionId" -Headers $headers

$summary = [pscustomobject]@{
    studyId = $studyId
    imageId = $imageId
    sessionId = $sessionId
    sessionStatus = $finalized.session.status
    landmarksCount = @($finalized.landmarks).Count
    measurementsCount = @($finalized.measurements).Count
    diagnosisPresent = ($null -ne $finalized.diagnosis)
    treatmentCount = @($finalized.treatments).Count
    overlayCount = @($overlays).Count
    reportId = $report.id
    reportsCount = @($reports).Count
}

Write-Output 'STEP done'
$summary | ConvertTo-Json -Depth 8
