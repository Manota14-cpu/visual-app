# =====================================================================
#  Abre Visual App
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
        $mensaje, "Visual App",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
}

# --- Node -----------------------------------------------------------

# El motor que trae el instalador va primero.
#
# Vive al lado de los datos y no adentro del programa a propósito: la
# actualización reemplaza la carpeta del programa ENTERA, así que cualquier
# cosa guardada ahí desaparece en la primera actualización. En la carpeta de
# datos, que no se toca nunca, sobrevive por cómo están hechas las cosas y no
# porque alguien se acuerde de copiarlo.
$node = $null
$propio = Join-Path $env:LOCALAPPDATA "Visual App\runtime\node.exe"

if (Test-Path $propio) {
    $node = $propio
} else {
    # Si no vino con el programa, sirve cualquier Node de la computadora.
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
}

if (-not $node) {
    Esconder
    Cartel "No se encontró Node.js en esta computadora, y Visual App lo necesita para funcionar.`n`nInstalalo con este comando y volvé a abrir Visual App:`n`n    winget install OpenJS.NodeJS.LTS"
    exit 1
}

# --- A correr -------------------------------------------------------

Esconder

$registro = Join-Path $env:TEMP "visual-app-arranque.txt"

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
    Cartel "Visual App se cerró con un error.`n`n$detalle"
    exit $LASTEXITCODE
}
