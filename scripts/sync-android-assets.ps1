param(
    [switch]$Watch
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distPath = Join-Path $projectRoot "dist"
$defaultAndroidProjectPath = "C:\Users\HP\AndroidStudioProjects\Almacen3D2"
$androidProjectPath = if ($env:ANDROID_PROJECT_PATH) { $env:ANDROID_PROJECT_PATH } else { $defaultAndroidProjectPath }
$androidAssetsPath = Join-Path $androidProjectPath "app\src\main\assets"

function Show-FriendlyError {
    param(
        [string]$Message,
        [string]$Details
    )

    Write-Host ""
    Write-Host "No se pudo sincronizar el aplicativo movil." -ForegroundColor Yellow
    Write-Host $Message

    if ($Details -and $env:MOBILE_SYNC_DEBUG) {
        Write-Host ""
        Write-Host "Detalle tecnico: $Details" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "Si solo estas trabajando en la web, no necesitas ejecutar este comando."
    Write-Host "Para sincronizar Android en otra PC, define ANDROID_PROJECT_PATH con la ruta del proyecto Android."
    Write-Host "Ejemplo:"
    Write-Host '  $env:ANDROID_PROJECT_PATH="C:\Users\TU_USUARIO\AndroidStudioProjects\Almacen3D2"'
    Write-Host "  npm run mobile:sync"
    Write-Host ""
    Write-Host "Para ver detalles tecnicos, ejecuta antes:"
    Write-Host '  $env:MOBILE_SYNC_DEBUG="1"'
}

function Assert-AndroidProject {
    if (-not (Test-Path $androidProjectPath)) {
        throw "No encontre el proyecto Android en: $androidProjectPath"
    }

    $appPath = Join-Path $androidProjectPath "app"
    if (-not (Test-Path $appPath)) {
        throw "La ruta existe, pero no parece un proyecto Android valido porque falta: $appPath"
    }
}

function Invoke-MobileSync {
    Push-Location $projectRoot
    try {
        Assert-AndroidProject
        npm run build

        if (-not (Test-Path $distPath)) {
            throw "No existe la carpeta dist despues del build: $distPath"
        }

        if (-not (Test-Path $androidAssetsPath)) {
            New-Item -ItemType Directory -Path $androidAssetsPath | Out-Null
        }

        robocopy $distPath $androidAssetsPath /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
        $exitCode = $LASTEXITCODE

        if ($exitCode -gt 7) {
            throw "Robocopy fallo con codigo $exitCode"
        }

        Write-Host "Dist sincronizado en Android assets: $androidAssetsPath"
    }
    finally {
        Pop-Location
    }
}

try {
    Invoke-MobileSync
}
catch {
    Show-FriendlyError -Message $_.Exception.Message -Details $_.ScriptStackTrace
    exit 1
}

if ($Watch) {
    Write-Host "Observando cambios. Presiona Ctrl+C para detener."

    $pathsToWatch = @(
        (Join-Path $projectRoot "src"),
        (Join-Path $projectRoot "public")
    ) | Where-Object { Test-Path $_ }

    $watchers = @()

    foreach ($path in $pathsToWatch) {
        $watcher = New-Object System.IO.FileSystemWatcher
        $watcher.Path = $path
        $watcher.IncludeSubdirectories = $true
        $watcher.EnableRaisingEvents = $true

        Register-ObjectEvent $watcher Changed -Action { $global:needsSync = $true } | Out-Null
        Register-ObjectEvent $watcher Created -Action { $global:needsSync = $true } | Out-Null
        Register-ObjectEvent $watcher Deleted -Action { $global:needsSync = $true } | Out-Null
        Register-ObjectEvent $watcher Renamed -Action { $global:needsSync = $true } | Out-Null

        $watchers += $watcher
    }

    while ($true) {
        Start-Sleep -Seconds 1

        if ($global:needsSync) {
            $global:needsSync = $false
            Start-Sleep -Milliseconds 500

            try {
                Invoke-MobileSync
            }
            catch {
                Show-FriendlyError -Message $_.Exception.Message -Details $_.ScriptStackTrace
            }
        }
    }
}
