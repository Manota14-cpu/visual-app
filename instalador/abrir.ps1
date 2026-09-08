# =====================================================================
#  Abre AppPack
# =====================================================================
#  Levanta el servidor y esconde la consola: la aplicación se ve como
#  una ventana común, sin el cuadro negro atrás.
#
#  Si Node no está o el programa se cae al arrancar, muestra el motivo
#  en un cartel — sin esto, un error dejaría la pantalla en blanco y
#  nadie sabría por qué no abrió.
# =====================================================================

$ErrorActionPreference = "Stop"

$aca = $PSScriptRoot

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Consola {
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int estado);
}
"@ -ErrorAction SilentlyContinue

function Esconder {
    try {
        $consola = [Consola]::GetConsoleWindow()
        if ($consola -ne [IntPtr]::Zero) { [Consola]::ShowWindow($consola, 0) | Out-Null }
    } catch { }
}

function Cartel($mensaje) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        $mensaje, "AppPack",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
}

# --- Node -----------------------------------------------------------

$node = $null
$enPath = Get-Command node -ErrorAction SilentlyContinue
if ($enPath) {
    $node = $enPath.Source
} else {
    foreach ($ruta in @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )) {
        if (Test-Path $ruta) { $node = $ruta; break }
    }
}

if (-not $node) {
    Esconder
    Cartel "No se encontró Node.js en esta computadora, y AppPack lo necesita para funcionar.`n`nInstalalo con este comando y volvé a abrir AppPack:`n`n    winget install OpenJS.NodeJS.LTS"
    exit 1
}

# --- A correr -------------------------------------------------------

Esconder

$registro = Join-Path $env:TEMP "apppack-arranque.txt"

# El servidor escribe en la consola escondida; se guarda en un archivo para
# poder mostrar el motivo si algo sale mal.
#
# No recibe argumentos: para otro puerto o otra carpeta de datos se llama a node
# directamente, como hace `npm run servidor`. PowerShell intenta interpretar
# cualquier `--algo` como un parámetro suyo y falla antes de llegar acá.
& $node (Join-Path $aca "servidor\index.js") *> $registro

if ($LASTEXITCODE -ne 0) {
    $detalle = ""
    if (Test-Path $registro) { $detalle = (Get-Content $registro -Tail 12) -join "`n" }
    Cartel "AppPack se cerró con un error.`n`n$detalle"
    exit $LASTEXITCODE
}
