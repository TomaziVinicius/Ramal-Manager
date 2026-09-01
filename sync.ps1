# ==============================================================================
# Script de Sincronizacao Completa - Local -> Servidor de Producao
# ==============================================================================
param (
    [switch]$RestartApp,
    [string]$ServerHost = "10.250.220.244",
    [string]$ServerUser = "root",
    [string]$RemoteDir = "/opt/ramais"
)

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Sincronizando Ramais -> $ServerHost"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   SINCRONIZACAO COMPLETA COM O SERVIDOR ($ServerHost)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
    # 1. Testar conexao SSH
    Write-Host "[1/4] Testando comunicacao com o servidor..." -NoNewline
    $testResult = ssh -o BatchMode=yes -o ConnectTimeout=3 "$ServerUser@$ServerHost" "echo OK" 2>&1
    if ($testResult -notmatch "OK") {
        throw "Falha ao conectar via SSH ao servidor $ServerHost. Verifique sua rede."
    }
    Write-Host " [OK]" -ForegroundColor Green

    # 2. Sincronizar arquivos estaticos (public/)
    Write-Host "[2/4] Enviando pasta 'public/' (HTML, CSS, JS)..." -NoNewline
    scp -r -o BatchMode=yes "public" "$ServerUser@$ServerHost`:$RemoteDir/"
    Write-Host " [OK]" -ForegroundColor Green

    # 3. Sincronizar arquivos raiz do sistema
    Write-Host "[3/4] Enviando arquivos do sistema (server.js, configs)..." -NoNewline
    $rootFiles = @("server.js", "package.json", "Dockerfile", "docker-compose.yml")
    foreach ($file in $rootFiles) {
        if (Test-Path $file) {
            scp -o BatchMode=yes $file "$ServerUser@$ServerHost`:$RemoteDir/$file"
        }
    }
    Write-Host " [OK]" -ForegroundColor Green

    # 4. Atualizar arquivos dentro do container Docker
    Write-Host "[4/4] Aplicando alteracoes no container Docker ramais_app..." -NoNewline
    $dockerCmd = "docker cp $RemoteDir/public/. ramais_app:/app/public/ && docker cp $RemoteDir/server.js ramais_app:/app/server.js"
    
    if ($RestartApp) {
        $dockerCmd += " && docker restart ramais_app"
    }

    $remoteExec = ssh -o BatchMode=yes "$ServerUser@$ServerHost" $dockerCmd 2>&1
    Write-Host " [OK]" -ForegroundColor Green

    $sw.Stop()
    Write-Host ""
    Write-Host "------------------------------------------------------------" -ForegroundColor Green
    Write-Host " [SUCESSO] Sincronizacao concluida em $($sw.ElapsedMilliseconds)ms!" -ForegroundColor Green
    if ($RestartApp) {
        Write-Host " [*] Container 'ramais_app' reiniciado com sucesso." -ForegroundColor Yellow
    } else {
        Write-Host " [*] Alteracoes de front-end (CSS/HTML/JS) ja ativas no navegador (F5)." -ForegroundColor Gray
        Write-Host " [*] Dica: se alterou o server.js, execute com -RestartApp para reiniciar o servico." -ForegroundColor Gray
    }
    Write-Host "------------------------------------------------------------" -ForegroundColor Green
    Write-Host ""
}
catch {
    $sw.Stop()
    Write-Host " [ERRO]" -ForegroundColor Red
    Write-Host "Erro durante a sincronizacao: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}
