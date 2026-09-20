# =====================================================================
#  Aplica una actualización de Visual App
# =====================================================================
#  Lo llama el propio programa después de bajar y verificar el paquete
#  nuevo. Corre desde la carpeta de ese paquete —no desde la carpeta
#  instalada— porque lo primero que hace el instalador es reemplazar la
#  carpeta instalada, y un script no puede pararse sobre el piso que
#  está levantando.
#
#  Tampoco es hijo de Visual App: el instalador cierra Visual App, así que si
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

<#
    Deja rastro de lo que pasó, al lado de los datos.

    Una actualización que falla en silencio es imposible de diagnosticar: el
    programa sigue andando con la versión vieja y no queda nada que mirar.
#>
function Anotar($mensaje) {
    try {
        $carpeta = Join-Path $env:LOCALAPPDATA "Visual App"
        if (-not (Test-Path $carpeta)) { New-Item -ItemType Directory -Path $carpeta -Force | Out-Null }
        $sello = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path (Join-Path $carpeta "actualizaciones.log") -Value "$sello  $mensaje" -Encoding utf8
    } catch { }
}

# Windows.Forms se carga ACÁ y no adentro de Cartel.
#
# Estaba adentro, y el ícono que se le pasa —MessageBoxIcon::Warning— lo evalúa
# quien llama, ANTES de entrar a la función y por lo tanto antes de que el
# ensamblado esté cargado. El único cartel que avisaba del fallo fallaba
# también, con "No se encuentra el tipo": la actualización no se aplicaba y
# nadie se enteraba de por qué.
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

function Cartel($mensaje, $icono) {
    try {
        [System.Windows.Forms.MessageBox]::Show(
            $mensaje, "Visual App",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            $icono) | Out-Null
    } catch {
        Anotar "No se pudo mostrar el aviso: $mensaje"
    }
}

# Dónde está instalado, según Windows. No se supone la carpeta del usuario:
# desde que se puede elegir dónde instalar, suponerla haría que después de
# actualizar se abriera la copia equivocada — o ninguna.
$clave = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VisualApp"
$destino = (Get-ItemProperty $clave -ErrorAction SilentlyContinue).InstallLocation
if (-not $destino) { $destino = "$env:LOCALAPPDATA\Programs\Visual App" }

# Un respiro para que Visual App termine de contestar y se apague por su cuenta.
# El instalador cierra lo que quede, pero cerrarse solo es más prolijo.
Start-Sleep -Seconds 3

# Pararse en la carpeta del paquete, no en la instalada.
#
# El programa ahora lanza este script con esa carpeta como directorio actual,
# pero si alguna vez lo llama de otro lado —o alguien lo corre a mano— esto lo
# vuelve a poner donde tiene que estar: Windows no deja renombrar una carpeta
# que es el directorio actual de algún proceso, y renombrar la carpeta
# instalada es exactamente lo que el instalador está por hacer.
Set-Location -LiteralPath $Paquete

Anotar "Aplicando $Paquete sobre $destino"

$instalador = Join-Path $Paquete "instalar.ps1"
if (-not (Test-Path $instalador)) {
    Cartel "La actualización no se pudo aplicar: el paquete está incompleto.`n`nVisual App quedó como estaba." ([System.Windows.Forms.MessageBoxIcon]::Warning)
    exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $instalador -Silencioso
$codigo = $LASTEXITCODE

# Soltar las carpetas ANTES de cualquier cartel.
#
# Un cartel es modal: se queda esperando que alguien apriete OK. Si nadie lo
# ve —quedó detrás de otra ventana, la computadora está sola— este proceso se
# queda vivo para siempre, y mientras tanto retiene como directorio actual la
# carpeta del paquete. Eso bloqueaba el intento siguiente, que fallaba por la
# carpeta tomada, dejaba otro cartel colgado, y así. Un error se volvía
# permanente. Desde acá este script no se para sobre nada que importe.
Set-Location -LiteralPath $env:TEMP

# Pase lo que pase, el programa tiene que volver a abrirse: si falló, el
# instalador dejó la versión anterior en su lugar y esa es la que abre.
$lanzador = Join-Path $destino "Abrir Visual App.cmd"
if (Test-Path $lanzador) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$lanzador`"" -WindowStyle Hidden
}

if ($codigo -ne 0) {
    $motivo = switch ($codigo) {
        1 { "no se encontró Node.js" }
        2 { "el paquete bajado está incompleto" }
        3 { "la copia terminó con archivos faltantes" }
        4 { "la carpeta donde está instalado ya no sirve" }
        5 { "no se puede escribir en la carpeta donde está instalado" }
        6 { "la instalación se cortó; el motivo quedó en actualizaciones.log" }
        default { "el instalador terminó con el código $codigo" }
    }
    Anotar "FALLO ($codigo): $motivo"
    Cartel "No se pudo aplicar la actualización: $motivo.`n`nVisual App sigue funcionando con la versión que ya tenías." ([System.Windows.Forms.MessageBoxIcon]::Warning)
    exit $codigo
}

Anotar "Listo: quedó instalada la versión del paquete"

# El paquete ya cumplió. Dejarlo sería juntar una copia por cada versión.
Remove-Item $Paquete -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem (Split-Path $Paquete -Parent) -Filter "visual-app-*.zip" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
