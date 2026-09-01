# ==============================================================================
# Script Watch & Sync em Tempo Real - Local -> Servidor de Producao
# ==============================================================================
param (
    [string]$ServerHost = "10.250.220.244",
    [string]$ServerUser = "root",
    [string]$RemoteDir = "/opt/ramais"
)

$Host.UI.RawUI.WindowTitle = "Watch & Sync Ativo -> $ServerHost"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   WATCH & SYNC ATIVO EM TEMPO REAL -> $ServerHost" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " [*] Monitorando alteracoes nos arquivos locais..." -ForegroundColor Gray
Write-Host " [*] Ao salvar qualquer arquivo (Ctrl + S), ele sera enviado ao servidor." -ForegroundColor Gray
Write-Host " [*] Pressione Ctrl + C para encerrar o monitoramento." -ForegroundColor Yellow
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

$rootPath = $PSScriptRoot
if (-not $rootPath) { $rootPath = Get-Location }

# Dicionario para debounce de eventos repetidos do Windows
$lastEventTime = @{}
$debounceMs = 600

function Handle-FileChange {
    param ($fullPath, $changeType)

    $fileName = [System.IO.Path]::GetFileName($fullPath)
    $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()

    # Ignorar extensoes ou pastas irrelevantes
    if ($fullPath -match "\\\.git\\" -or $fullPath -match "\\\.system_generated\\" -or $ext -in @(".ps1", ".bat", ".tmp", ".log")) {
        return
    }

    if (-not (Test-Path -Path $fullPath -PathType Leaf)) {
        return
    }

    $now = [DateTime]::UtcNow
    if ($lastEventTime.ContainsKey($fullPath)) {
        $diff = ($now - $lastEventTime[$fullPath]).TotalMilliseconds
        if ($diff -lt $debounceMs) {
            return
        }
    }
    $lastEventTime[$fullPath] = $now

    # Calcular caminho relativo
    $relPath = $fullPath.Substring($rootPath.Length).TrimStart("\", "/")
    $unixRelPath = $relPath -replace "\\", "/"
    $remotePath = "$RemoteDir/$unixRelPath"

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $timestamp = (Get-Date).ToString("HH:mm:ss")

    try {
        Write-Host "[$timestamp] 🔄 Alteracao detectada: $unixRelPath -> Enviando..." -ForegroundColor Yellow -NoNewline

        # 1. Enviar arquivo via SCP
        scp -o BatchMode=yes -o ConnectTimeout=4 "$fullPath" "$ServerUser@$ServerHost`:$remotePath" 2>&1 | Out-Null

        # 2. Atualizar no container Docker
        if ($unixRelPath -match "^public/") {
            $cmd = "docker cp $remotePath ramais_app:/app/$unixRelPath"
            ssh -o BatchMode=yes "$ServerUser@$ServerHost" $cmd 2>&1 | Out-Null
            $sw.Stop()
            Write-Host " [OK] ($($sw.ElapsedMilliseconds)ms - Frontend Atualizado)" -ForegroundColor Green
        }
        elseif ($unixRelPath -eq "server.js") {
            $cmd = "docker cp $remotePath ramais_app:/app/server.js && docker restart ramais_app"
            ssh -o BatchMode=yes "$ServerUser@$ServerHost" $cmd 2>&1 | Out-Null
            $sw.Stop()
            Write-Host " [OK] ($($sw.ElapsedMilliseconds)ms - Backend Reiniciado)" -ForegroundColor Cyan
        }
        else {
            $sw.Stop()
            Write-Host " [OK] ($($sw.ElapsedMilliseconds)ms)" -ForegroundColor Green
        }
    }
    catch {
        $sw.Stop()
        Write-Host " [FALHA] ($($_.Exception.Message))" -ForegroundColor Red
    }
}

# Criar o FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $rootPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

# Registrar acoes de eventos
$action = {
    $path = $Event.SourceEventArgs.FullPath
    $change = $Event.SourceEventArgs.ChangeType
    Handle-FileChange -fullPath $path -changeType $change
}

$handlerChanged = Register-ObjectEvent $watcher "Changed" -Action $action
$handlerCreated = Register-ObjectEvent $watcher "Created" -Action $action

try {
    while ($true) {
        Start-Sleep -Milliseconds 200
    }
}
finally {
    Write-Host "`n[*] Encerrando monitoramento..." -ForegroundColor Yellow
    Unregister-Event -SourceIdentifier $handlerChanged.Name -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $handlerCreated.Name -ErrorAction SilentlyContinue
    $watcher.Dispose()
    Write-Host "[*] Monitoramento finalizado com sucesso." -ForegroundColor Gray
}
