# =====================================================================
#  Arma el paquete de AppPack
# =====================================================================
#  Tres pasos: compilar la interfaz de Next a archivos estáticos,
#  compilar el servidor de TypeScript a JavaScript, y dejar un .cmd que
#  abre todo con doble clic.
#
#  El resultado corre sobre el Node del sistema. No se compila ningún
#  ejecutable a propósito: Windows bloquea los .exe sin firma digital, y
#  node.exe —que sí viene firmado— no tiene ese problema.
#
#  Uso:   powershell -ExecutionPolicy Bypass -File .\build.ps1
# =====================================================================

param(
    # Lo que va a leer la gente en el aviso de "hay una versión nueva".
    [string]$Notas = "",
    # De dónde va a bajar el paquete el programa instalado. Con GitHub,
    # `releases/latest/download/apppack.zip` apunta siempre a la última.
    [string]$Descargas = "https://github.com/Manota14-cpu/apppack-escritorio/releases/latest/download/apppack.zip"
)

$ErrorActionPreference = "Stop"
$raiz = $PSScriptRoot
Set-Location $raiz

function Paso($texto) {
    Write-Host ""
    Write-Host "  $texto" -ForegroundColor Cyan
}

# --- Comprobaciones -------------------------------------------------

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Falta Node.js. Instalalo con:  winget install OpenJS.NodeJS.LTS" -ForegroundColor Red
    Write-Host "Después cerrá y volvé a abrir esta ventana." -ForegroundColor Yellow
    exit 1
}

$salida = "$raiz\dist"
if (Test-Path $salida) { Remove-Item $salida -Recurse -Force }
New-Item -ItemType Directory -Path $salida | Out-Null

# --- 1. Dependencias ------------------------------------------------

if (-not (Test-Path "$raiz\node_modules")) {
    Paso "Instalando dependencias"
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# --- 2. La interfaz -------------------------------------------------

Paso "Compilando la interfaz (Next)"
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path "$raiz\out\index.html")) {
    Write-Host "Next no dejó la carpeta 'out'. Revisá que next.config.mjs tenga output: 'export'." -ForegroundColor Red
    exit 1
}

Copy-Item "$raiz\out" "$salida\sitio" -Recurse

# --- 3. El servidor -------------------------------------------------

Paso "Compilando el servidor (TypeScript)"
npx tsc -p tsconfig.servidor.json
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# El servidor son módulos ES; sin esto Node los leería como CommonJS y no
# arrancaría ni el primer import.
'{ "type": "module" }' | Set-Content -Path "$salida\servidor\package.json" -Encoding ascii

# --- 4. El lanzador -------------------------------------------------

# Este archivo es el que abre la aplicación: le pasa la posta a abrir.ps1, que
# esconde la consola y levanta el servidor. Queda como .cmd —y no como acceso
# directo— para que la carpeta se pueda copiar a cualquier lado sin que se rompa
# la ruta.
@'
@echo off
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0abrir.ps1"
exit
'@ | Set-Content -Path "$salida\Abrir AppPack.cmd" -Encoding ascii

# --- 5. El instalador -----------------------------------------------

Paso "Preparando el instalador"

node "$raiz\herramientas\icono.mjs" "$salida\AppPack.ico"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Copy-Item "$raiz\instalador\*.ps1" $salida -Force

# La versión sale del programa y viaja con el paquete. El instalador la leía de
# una constante escrita a mano en su propio archivo, así que Windows mostraba
# 1.0.0 para siempre por más que la aplicación cambiara.
$fuente = Get-Content "$raiz\servidor\api\sistema.ts" -Raw
if ($fuente -match 'export const VERSION\s*=\s*"([^"]+)"') {
    $version = $matches[1]
    $version | Set-Content -Path "$salida\version.txt" -Encoding ascii -NoNewline
    Write-Host "  Version $version" -ForegroundColor DarkGray
} else {
    Write-Host "No se encontro VERSION en servidor/api/sistema.ts" -ForegroundColor Red
    exit 1
}

# El asistente tiene ventana propia; la consola la esconde él mismo apenas
# arranca. Es un .cmd y no un acceso directo para que la carpeta se pueda
# copiar a cualquier lado sin que se rompa la ruta.
@'
@echo off
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
exit
'@ | Set-Content -Path "$salida\Instalar AppPack.cmd" -Encoding ascii

# --- 6. Lo que se publica -------------------------------------------

# Dos archivos para subir a una publicación de GitHub. Los nombres NO llevan la
# versión a propósito: con `releases/latest/download/<archivo>` la dirección es
# siempre la misma y apunta sola a la última, así que el programa instalado no
# tiene nada que reconfigurar cuando sale una versión nueva.

Paso "Armando lo que se publica"

$publicar = "$raiz\publicar"
if (Test-Path $publicar) { Remove-Item $publicar -Recurse -Force }
New-Item -ItemType Directory -Path $publicar | Out-Null

$zip = "$publicar\apppack.zip"
Compress-Archive -Path "$salida\*" -DestinationPath $zip -Force

$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
$tamano = (Get-Item $zip).Length

$aviso = [ordered]@{
    version = $version
    fecha   = (Get-Date -Format "yyyy-MM-dd")
    notas   = $Notas
    archivo = $Descargas
    sha256  = $hash
    tamano  = $tamano
}
# Sin BOM. `Set-Content -Encoding utf8` en PowerShell 5.1 escribe la marca de
# orden al principio del archivo, y aunque `fetch` la descarta —probado—, un
# JSON que empieza con un carácter invisible rompe cualquier otra cosa que lo
# lea. No vale la pena dejarlo librado a que el que lo lea sea indulgente.
[System.IO.File]::WriteAllText(
    "$publicar\version.json",
    ($aviso | ConvertTo-Json),
    (New-Object System.Text.UTF8Encoding $false)
)

# --- Listo ----------------------------------------------------------

$peso = [math]::Round((Get-ChildItem $salida -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 1)

Write-Host ""
Write-Host "  Listo." -ForegroundColor Green
Write-Host ""
Write-Host "  $salida  ($peso MB)"
Write-Host "     Instalar AppPack.cmd   instala en esta computadora"
Write-Host "     Abrir AppPack.cmd      abre el programa sin instalarlo"
Write-Host "     servidor\              la API y las reglas"
Write-Host "     sitio\                 las pantallas"
Write-Host ""
Write-Host "  $publicar" -ForegroundColor Cyan
Write-Host "     apppack.zip     el paquete que baja la actualización automática"
Write-Host "     version.json    el aviso que dice que hay una versión nueva"
Write-Host ""
Write-Host "  Para publicar la versión $version, subí esos dos archivos como"
Write-Host "  adjuntos de una publicación nueva en GitHub. Las computadoras que"
Write-Host "  ya tienen AppPack la van a ver dentro de las 24 horas."
if ($Descargas -like "*USUARIO/REPO*") {
    Write-Host ""
    Write-Host "  OJO: la direccion de descarga sigue siendo la de ejemplo." -ForegroundColor Yellow
    Write-Host "  Pasala con -Descargas y poné tu usuario y repositorio." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  La carpeta se copia entera a otra computadora con Windows: ahí se"
Write-Host "  ejecuta el instalador y queda con acceso directo y desinstalador."
Write-Host "  Solo hace falta que esa computadora tenga Node.js."
Write-Host "  Los datos quedan en %LOCALAPPDATA%\AppPack\datos.json"
Write-Host ""
