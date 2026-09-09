# =====================================================================
#  Desinstalador de Visual App
# =====================================================================
#  Lo llama Windows desde "Aplicaciones instaladas", o se ejecuta a mano.
#  Muestra una ventana de confirmación y avisa dónde quedaron los datos.
#
#  Los datos NO se borran: el catálogo, las ventas y los turnos de caja
#  son del negocio, no del programa.
#
#  Con -Silencioso desinstala sin preguntar.
# =====================================================================

param(
    [switch]$Silencioso
)

$ErrorActionPreference = "Continue"

$datos = "$env:LOCALAPPDATA\Visual App"
$clave = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VisualApp"

# La carpeta a desinstalar es esta misma, porque este script vive adentro del
# programa. Se deja de suponer que está en la carpeta del usuario: desde que se
# puede elegir dónde instalar, suponerlo desinstalaría la copia equivocada — o
# ninguna.
$destino = $PSScriptRoot
if (-not (Test-Path (Join-Path $destino "servidor\index.js"))) {
    $anotada = (Get-ItemProperty $clave -ErrorAction SilentlyContinue).InstallLocation
    if ($anotada) { $destino = $anotada }
}

function Desinstalar {
    # Cerrar lo que esté abierto, en este orden.
    #
    # Primero el lanzador: se queda esperando al servidor y, si el servidor
    # muere de un tiro, cree que el programa se cayó y saca un cartel de error
    # en medio de una desinstalación que salió bien.
    #
    # La ventana se reconoce por el perfil que usa, que vive en la carpeta de
    # datos: así se cierra la de Visual App y no las pestañas de nadie.
    $perfil = Join-Path $datos "ventana"

    # Se busca por la RUTA de la carpeta instalada, no por la palabra "Visual App"
    # suelta: buscar por texto suelto ya se llevó puesto un proceso ajeno que
    # solo mencionaba el nombre.
    $procesos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine })

    $procesos |
        Where-Object {
            $_.Name -eq "powershell.exe" -and $_.CommandLine -like "*abrir.ps1*" -and
            $_.CommandLine -like "*$destino*"
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    $procesos |
        Where-Object {
            ($_.Name -eq "node.exe" -and $_.CommandLine -like "*$destino*") -or
            ($_.Name -in @("msedge.exe", "chrome.exe") -and $_.CommandLine -like "*$perfil*")
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Start-Sleep -Milliseconds 800

    foreach ($acceso in @(
        (Join-Path ([Environment]::GetFolderPath("Programs")) "Visual App.lnk"),
        (Join-Path ([Environment]::GetFolderPath("Desktop")) "Visual App.lnk")
    )) {
        if (Test-Path $acceso) { Remove-Item $acceso -Force -ErrorAction SilentlyContinue }
    }

    if (Test-Path $clave) { Remove-Item $clave -Recurse -Force -ErrorAction SilentlyContinue }

    # Este mismo archivo vive adentro de la carpeta que hay que borrar, así que
    # no puede borrarla él: se le encarga a una ventana aparte que espera a que
    # este proceso termine.
    #
    # Antes de eso se comprueba que sea de verdad una instalación de Visual App.
    # Esto borra una carpeta entera y sin preguntar: desde que se puede elegir
    # dónde instalar, una ruta equivocada acá se lleva puesto lo que haya. Que
    # esté `servidor\index.js` adentro es la prueba de que la carpeta es nuestra.
    $esNuestra = $destino -and
        (Test-Path (Join-Path $destino "servidor\index.js")) -and
        ($destino -ne [System.IO.Path]::GetPathRoot($destino))

    if ($esNuestra) {
        Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "timeout /t 3 /nobreak >nul & rmdir /s /q `"$destino`"" `
            -WindowStyle Hidden
    }
}

if ($Silencioso) {
    Desinstalar
    exit 0
}

# ─────────────────────────────  Con ventana  ─────────────────────────────

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class PantallaDesinstalar {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int estado);
}
"@ -ErrorAction SilentlyContinue

try { [PantallaDesinstalar]::SetProcessDPIAware() | Out-Null } catch { }

function EsconderConsola {
    # Recién cuando la ventana ya está: si se esconde antes, Windows le aplica
    # el mismo estado a la primera ventana que muestra el proceso.
    try {
        $consola = [PantallaDesinstalar]::GetConsoleWindow()
        if ($consola -ne [IntPtr]::Zero) { [PantallaDesinstalar]::ShowWindow($consola, 0) | Out-Null }
    } catch { }
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$Blanco = [System.Drawing.Color]::White
$Lienzo = [System.Drawing.Color]::FromArgb(245, 245, 247)
$Tinta = [System.Drawing.Color]::FromArgb(29, 29, 31)
$Suave = [System.Drawing.Color]::FromArgb(110, 110, 115)
$Linea = [System.Drawing.Color]::FromArgb(228, 228, 232)
$Rojo = [System.Drawing.Color]::FromArgb(194, 35, 26)

function Letra($tamano, $estilo = [System.Drawing.FontStyle]::Regular) {
    New-Object System.Drawing.Font("Segoe UI", $tamano, $estilo)
}

$ventana = New-Object System.Windows.Forms.Form
$ventana.Text = "Desinstalar Visual App"
$ventana.ClientSize = New-Object System.Drawing.Size(520, 260)
$ventana.FormBorderStyle = "FixedDialog"
$ventana.StartPosition = "CenterScreen"
$ventana.MaximizeBox = $false
$ventana.MinimizeBox = $false
$ventana.BackColor = $Blanco
$ventana.Font = Letra 9.75

$rutaIcono = Join-Path $destino "Visual App.ico"
if (Test-Path $rutaIcono) { $ventana.Icon = New-Object System.Drawing.Icon($rutaIcono) }

function Texto($contenido, $x, $y, $ancho, $alto, $color, $fuente) {
    $etiqueta = New-Object System.Windows.Forms.Label
    $etiqueta.Text = $contenido
    $etiqueta.Location = New-Object System.Drawing.Point($x, $y)
    $etiqueta.Size = New-Object System.Drawing.Size($ancho, $alto)
    $etiqueta.ForeColor = $color
    if ($fuente) { $etiqueta.Font = $fuente }
    return $etiqueta
}

$cuerpo = New-Object System.Windows.Forms.Panel
$cuerpo.Location = New-Object System.Drawing.Point(0, 0)
$cuerpo.Size = New-Object System.Drawing.Size(520, 178)
$ventana.Controls.Add($cuerpo)

$cuerpo.Controls.Add((Texto "¿Desinstalar Visual App?" 32 34 460 30 $Tinta (Letra 14)))
$cuerpo.Controls.Add((Texto ("Se saca el programa, sus accesos directos y la anotación en Windows.") 32 72 456 24 $Suave $null))
$cuerpo.Controls.Add((Texto ("Tus datos NO se borran: el catálogo, las ventas y los turnos quedan en " +
    "$datos. Si no los querés más, borrá esa carpeta a mano.") 32 100 456 60 $Suave (Letra 9)))

$pie = New-Object System.Windows.Forms.Panel
$pie.Location = New-Object System.Drawing.Point(0, 178)
$pie.Size = New-Object System.Drawing.Size(520, 82)
$pie.BackColor = $Lienzo
$ventana.Controls.Add($pie)

$bordePie = New-Object System.Windows.Forms.Panel
$bordePie.BackColor = $Linea
$bordePie.Location = New-Object System.Drawing.Point(0, 0)
$bordePie.Size = New-Object System.Drawing.Size(520, 1)
$pie.Controls.Add($bordePie)

$aceptar = New-Object System.Windows.Forms.Button
$aceptar.Text = "Desinstalar"
$aceptar.Size = New-Object System.Drawing.Size(140, 38)
$aceptar.Location = New-Object System.Drawing.Point(344, 22)
$aceptar.FlatStyle = "Flat"
$aceptar.FlatAppearance.BorderSize = 0
$aceptar.BackColor = $Rojo
$aceptar.ForeColor = $Blanco
$aceptar.Font = Letra 10 ([System.Drawing.FontStyle]::Bold)
$aceptar.Cursor = "Hand"
$pie.Controls.Add($aceptar)

$cancelar = New-Object System.Windows.Forms.Button
$cancelar.Text = "Cancelar"
$cancelar.Size = New-Object System.Drawing.Size(110, 38)
$cancelar.Location = New-Object System.Drawing.Point(220, 22)
$cancelar.FlatStyle = "Flat"
$cancelar.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(210, 210, 215)
$cancelar.BackColor = $Blanco
$cancelar.ForeColor = $Tinta
$cancelar.Cursor = "Hand"
$pie.Controls.Add($cancelar)
$cancelar.Add_Click({ $ventana.Close() })

$script:hecho = $false

$aceptar.Add_Click({
    if ($script:hecho) { $ventana.Close(); return }

    $aceptar.Enabled = $false
    $cancelar.Enabled = $false
    $cuerpo.Controls.Clear()
    $cuerpo.Controls.Add((Texto "Desinstalando…" 32 60 456 28 $Tinta (Letra 12)))
    $ventana.Refresh()

    Desinstalar

    $cuerpo.Controls.Clear()
    $cuerpo.Controls.Add((Texto "Visual App se desinstaló" 32 40 456 30 $Tinta (Letra 14)))
    $cuerpo.Controls.Add((Texto ("Tus datos siguen en $datos, con el archivo datos.json y la carpeta de copias.") 32 84 456 60 $Suave $null))

    $cancelar.Visible = $false
    $aceptar.Text = "Cerrar"
    $aceptar.BackColor = [System.Drawing.Color]::FromArgb(0, 113, 227)
    $aceptar.Enabled = $true
    $script:hecho = $true
})

$ventana.CancelButton = $cancelar
$ventana.Add_Shown({
    EsconderConsola
    $ventana.Activate()
})
[void]$ventana.ShowDialog()
