# =====================================================================
#  Aplica una actualización de AppPack
# =====================================================================
#  Lo llama el propio programa después de bajar y verificar el paquete
#  nuevo. Corre desde la carpeta de ese paquete —no desde la carpeta
#  instalada— porque lo primero que hace el instalador es reemplazar la
#  carpeta instalada, y un script no puede pararse sobre el piso que
#  está levantando.
#
#  Tampoco es hijo de AppPack: el instalador cierra AppPack, así que si
#  colgara de él se moriría a mitad de camino.
# =====================================================================

param(
    [Parameter(Mandatory = $true)][string]$Paquete
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ConsolaActualizar {
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int estado);
}
"@ -ErrorAction SilentlyContinue

try {
    $consola = [ConsolaActualizar]::GetConsoleWindow()
    if ($consola -ne [IntPtr]::Zero) { [ConsolaActualizar]::ShowWindow($consola, 0) | Out-Null }
} catch { }

function Cartel($mensaje, $icono) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        $mensaje, "AppPack",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        $icono) | Out-Null
}

# Dónde está instalado, según Windows. No se supone la carpeta del usuario:
# desde que se puede elegir dónde instalar, suponerla haría que después de
# actualizar se abriera la copia equivocada — o ninguna.
$clave = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AppPack"
$destino = (Get-ItemProperty $clave -ErrorAction SilentlyContinue).InstallLocation
if (-not $destino) { $destino = "$env:LOCALAPPDATA\Programs\AppPack" }

# Un respiro para que AppPack termine de contestar y se apague por su cuenta.
# El instalador cierra lo que quede, pero cerrarse solo es más prolijo.
Start-Sleep -Seconds 3

$instalador = Join-Path $Paquete "instalar.ps1"
if (-not (Test-Path $instalador)) {
    Cartel "La actualización no se pudo aplicar: el paquete está incompleto.`n`nAppPack quedó como estaba." ([System.Windows.Forms.MessageBoxIcon]::Warning)
    exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $instalador -Silencioso
$codigo = $LASTEXITCODE

# Pase lo que pase, el programa tiene que volver a abrirse: si falló, el
# instalador dejó la versión anterior en su lugar y esa es la que abre.
$lanzador = Join-Path $destino "Abrir AppPack.cmd"
if (Test-Path $lanzador) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$lanzador`"" -WindowStyle Hidden
}

if ($codigo -ne 0) {
    $motivo = switch ($codigo) {
        1 { "no se encontró Node.js" }
        2 { "el paquete bajado está incompleto" }
        3 { "la copia terminó con archivos faltantes" }
        default { "el instalador terminó con el código $codigo" }
    }
    Cartel "No se pudo aplicar la actualización: $motivo.`n`nAppPack sigue funcionando con la versión que ya tenías." ([System.Windows.Forms.MessageBoxIcon]::Warning)
    exit $codigo
}

# El paquete ya cumplió. Dejarlo sería juntar una copia por cada versión.
Remove-Item $Paquete -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem (Split-Path $Paquete -Parent) -Filter "apppack-*.zip" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
