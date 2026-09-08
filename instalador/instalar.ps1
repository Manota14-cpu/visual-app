# =====================================================================
#  Instalador de AppPack
# =====================================================================
#  Un asistente con ventana, como el de cualquier programa: pantalla de
#  bienvenida, barra de progreso y aviso de finalizado.
#
#  Está escrito sobre PowerShell y WinForms en vez de compilarse a un
#  .exe por una razón concreta: Windows 11 con Control de aplicaciones
#  inteligente bloquea cualquier ejecutable sin firma digital, incluido
#  el instalador. PowerShell viene firmado por Microsoft, así que este
#  asistente abre en cualquier máquina sin pedir permiso a nadie.
#
#  Con -Silencioso instala sin mostrar nada, para reinstalar por script.
# =====================================================================

param(
    [switch]$Silencioso,
    # Dónde instalar. Vacío significa "donde ya está, o donde va por omisión".
    # Lo usa la actualización automática para no mudar el programa de lugar.
    [string]$Destino = ""
)

$ErrorActionPreference = "Stop"

$origen = $PSScriptRoot
$datos = "$env:LOCALAPPDATA\AppPack"
$clave = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\AppPack"

# La carpeta del usuario es la que evita el cartel de administrador, así que es
# la que se propone. Elegir otra se puede, y más abajo está lo que hace falta
# para que eso no termine mal.
$porDefecto = "$env:LOCALAPPDATA\Programs\AppPack"

<#
    Dónde está instalado hoy, según Windows.

    Reinstalar y actualizar tienen que caer donde ya está, no donde iría una
    instalación nueva: si no, elegir otra carpeta una vez dejaría dos copias, y
    la actualización automática mudaría el programa a espaldas de todos.
#>
function CarpetaInstalada {
    $anotada = (Get-ItemProperty $clave -ErrorAction SilentlyContinue).InstallLocation
    if ($anotada -and (Test-Path (Join-Path $anotada "servidor\index.js"))) { return $anotada }
    if (Test-Path (Join-Path $porDefecto "servidor\index.js")) { return $porDefecto }
    return $null
}

$yaInstalado = CarpetaInstalada

# Se escribe con $script: porque la pantalla la puede cambiar. Las funciones de
# más abajo la leen como $destino, que es la misma variable.
$script:destino = if ($Destino) { $Destino.TrimEnd('\') }
                  elseif ($yaInstalado) { $yaInstalado }
                  else { $porDefecto }

# La versión la escribe build.ps1 al armar el paquete, sacándola del programa.
# Estaba escrita a mano acá y quedaba vieja: Windows mostraba 1.0.0 para
# siempre, sin importar qué se hubiera instalado.
$version = "1.0.0"
$rutaVersion = Join-Path $PSScriptRoot "version.txt"
if (Test-Path $rutaVersion) {
    $leida = (Get-Content $rutaVersion -Raw -ErrorAction SilentlyContinue).Trim()
    if ($leida) { $version = $leida }
}

# Si ya hay una copia instalada, esto es una actualización y se dice así.
$script:yaEstaba = $null -ne $yaInstalado

<#
    Qué carpeta se puede usar y cuál no.

    Esto existe por el desinstalador: borra la carpeta del programa entera. Si
    alguien eligiera "Documentos", desinstalar se llevaría Documentos. Por eso
    NUNCA se instala en la carpeta que se elige, sino en una AppPack adentro —es
    lo que hace cualquier instalador— y además se rechaza lo que no puede
    terminar bien.
#>
function RevisarDestino($ruta) {
    if (-not $ruta) { return "Elegí una carpeta." }

    try { $completa = [System.IO.Path]::GetFullPath($ruta) }
    catch { return "Esa ruta no es válida." }

    # La raíz de un disco no: borrar el programa borraría el disco.
    if ($completa -eq [System.IO.Path]::GetPathRoot($completa)) {
        return "No se puede instalar en la raíz de un disco. Elegí una carpeta adentro."
    }

    foreach ($prohibida in @($env:SystemRoot, "$env:SystemRoot\System32", $env:USERPROFILE, $env:LOCALAPPDATA, $env:APPDATA)) {
        if ($prohibida -and $completa.TrimEnd('\') -eq $prohibida.TrimEnd('\')) {
            return "Esa es una carpeta del sistema. Elegí otra."
        }
    }

    # Si la carpeta ya existe y tiene cosas que no son de AppPack, no se toca:
    # el desinstalador la borraría entera con todo lo que haya adentro.
    if ((Test-Path $completa) -and -not (Test-Path (Join-Path $completa "servidor\index.js"))) {
        if (@(Get-ChildItem $completa -Force -ErrorAction SilentlyContinue).Count -gt 0) {
            return "Esa carpeta ya tiene otras cosas adentro. Elegí una vacía o una nueva."
        }
    }

    return $null
}

<# ¿Se puede escribir ahí sin ser administrador? #>
function PuedeEscribir($ruta) {
    $donde = $ruta
    while ($donde -and -not (Test-Path $donde)) { $donde = Split-Path $donde -Parent }
    if (-not $donde) { return $false }

    try {
        $prueba = Join-Path $donde ([System.IO.Path]::GetRandomFileName())
        [System.IO.File]::WriteAllText($prueba, "x")
        Remove-Item $prueba -Force -ErrorAction SilentlyContinue
        return $true
    } catch {
        return $false
    }
}

# ─────────────────────────────  La instalación  ─────────────────────────────

function BuscarNode {
    $encontrado = Get-Command node -ErrorAction SilentlyContinue
    if ($encontrado) { return $encontrado.Source }

    foreach ($ruta in @(
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )) {
        if (Test-Path $ruta) { return $ruta }
    }

    return $null
}

function CerrarLoAbierto {
    # Si se está actualizando, el programa puede estar corriendo y con los
    # archivos tomados. Se cierra el servidor y también la ventana: quedaba
    # abierta contra un servidor que ya no existía, mostrando errores de red
    # que no eran tales.
    #
    # La ventana se reconoce por el perfil que usa, que vive en la carpeta de
    # datos: así se cierra la de AppPack y no las pestañas de nadie.
    $perfil = Join-Path $datos "ventana"

    # Se busca por RUTA COMPLETA, no por la palabra "AppPack" suelta en la línea
    # de comandos. Buscar por texto suelto ya se llevó puesto un proceso ajeno
    # que solo mencionaba el nombre; acá se apunta a las dos carpetas de las que
    # el programa puede estar corriendo —la instalada y la del paquete— y a
    # nada más.
    $carpetas = @($destino, $origen) | Select-Object -Unique
    $deNuestro = {
        param($linea)
        foreach ($carpeta in $carpetas) { if ($linea -like "*$carpeta*") { return $true } }
        return $false
    }

    $procesos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine })

    # El lanzador se cierra ANTES que el servidor: se queda esperando a node y,
    # si node muere de un tiro, cree que el programa se cayó y saca un cartel de
    # error justo en medio de una actualización que salió bien.
    $procesos |
        Where-Object {
            $_.Name -eq "powershell.exe" -and $_.CommandLine -like "*abrir.ps1*" -and
            (& $deNuestro $_.CommandLine)
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    $procesos |
        Where-Object {
            ($_.Name -eq "node.exe" -and (& $deNuestro $_.CommandLine)) -or
            ($_.Name -in @("msedge.exe", "chrome.exe") -and $_.CommandLine -like "*$perfil*")
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

    Start-Sleep -Milliseconds 800
}

function CopiarPrograma {
    param([scriptblock]$Avisar)

    # La copia se arma al lado y recién al final reemplaza a la que estaba.
    #
    # Antes se borraba la instalación vieja y después se copiaba encima: si la
    # copia se cortaba a la mitad —el disco lleno, el antivirus tomando un
    # archivo, un pendrive que se desconecta— el programa que funcionaba ya no
    # estaba y el nuevo tampoco. Actualizar no puede dejar a nadie sin nada.
    $enObra = "$destino.nuevo"
    $viejo = "$destino.viejo"

    foreach ($sobra in @($enObra, $viejo)) {
        if (Test-Path $sobra) { Remove-Item $sobra -Recurse -Force }
    }
    New-Item -ItemType Directory -Path $enObra -Force | Out-Null

    $partes = @("servidor", "sitio", "Abrir AppPack.cmd", "abrir.ps1", "AppPack.ico", "desinstalar.ps1")
    $archivos = @()
    foreach ($parte in $partes) {
        $ruta = Join-Path $origen $parte
        if (-not (Test-Path $ruta)) { continue }
        if (Test-Path $ruta -PathType Container) {
            $archivos += Get-ChildItem $ruta -Recurse -File
        } else {
            $archivos += Get-Item $ruta
        }
    }

    $total = [Math]::Max($archivos.Count, 1)
    $hechos = 0

    foreach ($archivo in $archivos) {
        $relativa = $archivo.FullName.Substring($origen.Length).TrimStart('\')
        $llegada = Join-Path $enObra $relativa
        $carpeta = Split-Path $llegada -Parent

        if (-not (Test-Path $carpeta)) { New-Item -ItemType Directory -Path $carpeta -Force | Out-Null }
        Copy-Item $archivo.FullName $llegada -Force

        $hechos++
        if ($Avisar) { & $Avisar ([int](($hechos / $total) * 100)) $relativa }
    }

    # El cambio de nombre es lo único que se ve desde afuera, y es instantáneo.
    # Si algo falla acá, se vuelve a poner la copia vieja donde estaba.
    try {
        if (Test-Path $destino) { Rename-Item $destino $viejo -ErrorAction Stop }
        Rename-Item $enObra $destino -ErrorAction Stop
    } catch {
        if ((Test-Path $viejo) -and -not (Test-Path $destino)) {
            Rename-Item $viejo $destino -ErrorAction SilentlyContinue
        }
        # Y sin dejar la copia a medio hacer ocupando lugar: si esto falló, el
        # usuario va a probar de nuevo, no a limpiar carpetas a mano.
        if (Test-Path $enObra) { Remove-Item $enObra -Recurse -Force -ErrorAction SilentlyContinue }
        throw
    }

    if (Test-Path $viejo) { Remove-Item $viejo -Recurse -Force -ErrorAction SilentlyContinue }
}

<#
    Que el paquete esté entero antes de empezar.

    Copiar la carpeta a un pendrive y que se corte a la mitad es lo más común
    del mundo. Sin esta comprobación el asistente instalaba igual —los archivos
    que no encontraba simplemente los saltaba— y el programa fallaba después,
    lejos de acá, con un error que no señala a nadie.
#>
function LoQueFalta {
    $necesarios = @(
        "servidor\index.js",
        "servidor\package.json",
        "sitio\index.html",
        "abrir.ps1",
        "desinstalar.ps1",
        "Abrir AppPack.cmd"
    )

    return @($necesarios | Where-Object { -not (Test-Path (Join-Path $origen $_)) })
}

<# Que lo instalado se pueda abrir. Se corre al final, antes de cantar victoria. #>
function QuedoBien {
    foreach ($parte in @("servidor\index.js", "sitio\index.html", "abrir.ps1")) {
        if (-not (Test-Path (Join-Path $destino $parte))) { return $false }
    }
    return $true
}

function CrearAccesos {
    param([bool]$EnElEscritorio)

    $shell = New-Object -ComObject WScript.Shell
    $icono = Join-Path $destino "AppPack.ico"
    $programa = Join-Path $destino "Abrir AppPack.cmd"

    $lugares = @((Join-Path ([Environment]::GetFolderPath("Programs")) "AppPack.lnk"))
    if ($EnElEscritorio) {
        $lugares += (Join-Path ([Environment]::GetFolderPath("Desktop")) "AppPack.lnk")
    }

    foreach ($lugar in $lugares) {
        $acceso = $shell.CreateShortcut($lugar)
        $acceso.TargetPath = $programa
        $acceso.WorkingDirectory = $destino
        $acceso.IconLocation = $icono
        $acceso.Description = "Stock, caja y ventas del negocio"
        $acceso.Save()
    }
}

function AnotarEnWindows {
    $peso = [math]::Round((Get-ChildItem $destino -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB)
    $icono = Join-Path $destino "AppPack.ico"

    New-Item -Path $clave -Force | Out-Null
    Set-ItemProperty $clave "DisplayName"     "AppPack"
    Set-ItemProperty $clave "DisplayVersion"  $version
    Set-ItemProperty $clave "Publisher"       "AppPack"
    Set-ItemProperty $clave "InstallLocation" $destino
    Set-ItemProperty $clave "DisplayIcon"     $icono
    Set-ItemProperty $clave "EstimatedSize"   $peso -Type DWord
    # Windows la muestra en la lista de aplicaciones instaladas, y es lo único
    # que después contesta "¿desde cuándo tengo esto?".
    Set-ItemProperty $clave "InstallDate"     (Get-Date -Format "yyyyMMdd")
    Set-ItemProperty $clave "NoModify"        1 -Type DWord
    Set-ItemProperty $clave "NoRepair"        1 -Type DWord
    # Sin -WindowStyle Hidden: cuando el proceso nace oculto, la ventana del
    # desinstalador hereda ese estado y no se ve. La consola la esconde el
    # propio script apenas arranca.
    Set-ItemProperty $clave "UninstallString" "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$destino\desinstalar.ps1`""
    Set-ItemProperty $clave "QuietUninstallString" "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$destino\desinstalar.ps1`" -Silencioso"
}

function AbrirAppPack {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$destino\Abrir AppPack.cmd`""
}

# ─────────────────────────────  Sin ventana  ─────────────────────────────

if ($Silencioso) {
    if ((LoQueFalta).Count -gt 0) { exit 2 }
    if (-not (BuscarNode)) { exit 1 }

    # Sin ventana no hay a quién avisarle, así que se comprueba igual y se sale
    # con un código que el que llamó pueda mirar.
    if (RevisarDestino $script:destino) { exit 4 }
    if (-not (PuedeEscribir $script:destino)) { exit 5 }

    CerrarLoAbierto
    CopiarPrograma
    CrearAccesos $true
    AnotarEnWindows

    if (-not (QuedoBien)) { exit 3 }
    exit 0
}

# ─────────────────────────────  Con ventana  ─────────────────────────────

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Dos arreglos de Windows, los dos necesarios:
#
# - `SetProcessDPIAware`: sin esto, en una pantalla con escala al 150% el texto
#   del asistente sale borroso.
# - `ShowWindow` sobre la consola: el asistente se abre desde un .cmd y esa
#   ventana negra no pinta nada, así que se esconde. Se hace desde adentro y no
#   arrancando PowerShell en modo oculto, porque cuando el proceso nace oculto
#   la primera ventana que abre hereda ese estado — y la que heredaba era
#   justamente la del asistente, que no aparecía nunca.
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Pantalla {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int estado);
}
"@ -ErrorAction SilentlyContinue

try { [Pantalla]::SetProcessDPIAware() | Out-Null } catch { }

function EsconderConsola {
    # Recién cuando el asistente ya está en pantalla: Windows le aplica a la
    # PRIMERA ventana que muestra un proceso el estado que tenga el proceso, así
    # que esconder la consola antes se llevaba puesta también la ventana.
    try {
        $consola = [Pantalla]::GetConsoleWindow()
        if ($consola -ne [IntPtr]::Zero) { [Pantalla]::ShowWindow($consola, 0) | Out-Null }
    } catch { }
}

[System.Windows.Forms.Application]::EnableVisualStyles()

$Blanco = [System.Drawing.Color]::White
$Lienzo = [System.Drawing.Color]::FromArgb(245, 245, 247)
$Tinta = [System.Drawing.Color]::FromArgb(29, 29, 31)
$Suave = [System.Drawing.Color]::FromArgb(110, 110, 115)
$Linea = [System.Drawing.Color]::FromArgb(228, 228, 232)
$Azul = [System.Drawing.Color]::FromArgb(0, 113, 227)
$Rojo = [System.Drawing.Color]::FromArgb(194, 35, 26)

function Letra($tamano, $estilo = [System.Drawing.FontStyle]::Regular) {
    New-Object System.Drawing.Font("Segoe UI", $tamano, $estilo)
}

$ventana = New-Object System.Windows.Forms.Form
$ventana.Text = $(if ($script:yaEstaba) { "Actualizar AppPack" } else { "Instalar AppPack" })
$ventana.ClientSize = New-Object System.Drawing.Size(600, 420)
$ventana.FormBorderStyle = "FixedDialog"
$ventana.StartPosition = "CenterScreen"
$ventana.MaximizeBox = $false
$ventana.MinimizeBox = $false
$ventana.BackColor = $Blanco
$ventana.Font = Letra 9.75

$rutaIcono = Join-Path $origen "AppPack.ico"
if (Test-Path $rutaIcono) {
    $iconoArchivo = New-Object System.Drawing.Icon($rutaIcono)
    $ventana.Icon = $iconoArchivo

    $logo = New-Object System.Windows.Forms.PictureBox
    $logo.Image = (New-Object System.Drawing.Icon($iconoArchivo, 64, 64)).ToBitmap()
    $logo.SizeMode = "Zoom"
    $logo.Location = New-Object System.Drawing.Point(36, 30)
    $logo.Size = New-Object System.Drawing.Size(56, 56)
    $ventana.Controls.Add($logo)
}

$titulo = New-Object System.Windows.Forms.Label
$titulo.Text = "AppPack"
$titulo.Font = Letra 19 ([System.Drawing.FontStyle]::Regular)
$titulo.ForeColor = $Tinta
$titulo.Location = New-Object System.Drawing.Point(108, 32)
$titulo.Size = New-Object System.Drawing.Size(400, 34)
$ventana.Controls.Add($titulo)

$bajada = New-Object System.Windows.Forms.Label
$bajada.Text = "Stock, caja y ventas del negocio"
$bajada.ForeColor = $Suave
$bajada.Location = New-Object System.Drawing.Point(111, 66)
$bajada.Size = New-Object System.Drawing.Size(400, 22)
$ventana.Controls.Add($bajada)

$separador = New-Object System.Windows.Forms.Panel
$separador.BackColor = $Linea
$separador.Location = New-Object System.Drawing.Point(0, 110)
$separador.Size = New-Object System.Drawing.Size(600, 1)
$ventana.Controls.Add($separador)

# El área que cambia en cada paso.
$cuerpo = New-Object System.Windows.Forms.Panel
$cuerpo.Location = New-Object System.Drawing.Point(0, 111)
$cuerpo.Size = New-Object System.Drawing.Size(600, 227)
$cuerpo.BackColor = $Blanco
$ventana.Controls.Add($cuerpo)

$pie = New-Object System.Windows.Forms.Panel
$pie.Location = New-Object System.Drawing.Point(0, 338)
$pie.Size = New-Object System.Drawing.Size(600, 82)
$pie.BackColor = $Lienzo
$ventana.Controls.Add($pie)

$bordePie = New-Object System.Windows.Forms.Panel
$bordePie.BackColor = $Linea
$bordePie.Location = New-Object System.Drawing.Point(0, 0)
$bordePie.Size = New-Object System.Drawing.Size(600, 1)
$pie.Controls.Add($bordePie)

function BotonPrincipal($texto) {
    $boton = New-Object System.Windows.Forms.Button
    $boton.Text = $texto
    $boton.Size = New-Object System.Drawing.Size(140, 38)
    $boton.Location = New-Object System.Drawing.Point(424, 22)
    $boton.FlatStyle = "Flat"
    $boton.FlatAppearance.BorderSize = 0
    $boton.BackColor = $Azul
    $boton.ForeColor = $Blanco
    $boton.Font = Letra 10 ([System.Drawing.FontStyle]::Bold)
    $boton.Cursor = "Hand"
    return $boton
}

$aceptar = BotonPrincipal $(if ($script:yaEstaba) { "Actualizar" } else { "Instalar" })
$pie.Controls.Add($aceptar)

$cancelar = New-Object System.Windows.Forms.Button
$cancelar.Text = "Cancelar"
$cancelar.Size = New-Object System.Drawing.Size(110, 38)
$cancelar.Location = New-Object System.Drawing.Point(300, 22)
$cancelar.FlatStyle = "Flat"
$cancelar.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(210, 210, 215)
$cancelar.BackColor = $Blanco
$cancelar.ForeColor = $Tinta
$cancelar.Cursor = "Hand"
$pie.Controls.Add($cancelar)
$cancelar.Add_Click({ $ventana.Close() })

function Texto($contenido, $x, $y, $ancho, $alto, $color, $fuente) {
    $etiqueta = New-Object System.Windows.Forms.Label
    $etiqueta.Text = $contenido
    $etiqueta.Location = New-Object System.Drawing.Point($x, $y)
    $etiqueta.Size = New-Object System.Drawing.Size($ancho, $alto)
    $etiqueta.ForeColor = $color
    if ($fuente) { $etiqueta.Font = $fuente }
    return $etiqueta
}

# ── Paso 1: bienvenida ──────────────────────────────────────────────

$node = BuscarNode

<#
    Elegir dónde instalar.

    Se elige la carpeta PADRE y el programa va en una AppPack adentro. No es un
    capricho de forma: el desinstalador borra la carpeta del programa entera, y
    si el destino fuera la carpeta elegida a secas, desinstalar desde
    "Documentos" se llevaría Documentos.

    Si lo que se elige ya es una instalación de AppPack, se usa tal cual: es
    alguien apuntando a donde ya está.
#>
function ElegirCarpeta {
    $selector = New-Object System.Windows.Forms.FolderBrowserDialog
    $selector.Description = "Elegí dónde crear la carpeta AppPack"
    $selector.ShowNewFolderButton = $true

    $actual = Split-Path $script:destino -Parent
    if ($actual -and (Test-Path $actual)) { $selector.SelectedPath = $actual }

    if ($selector.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }

    $elegida = $selector.SelectedPath.TrimEnd('\')
    $propuesta = if (Test-Path (Join-Path $elegida "servidor\index.js")) {
        $elegida
    } else {
        Join-Path $elegida "AppPack"
    }

    $problema = RevisarDestino $propuesta
    if (-not $problema -and -not (PuedeEscribir $propuesta)) {
        $problema = "Esa carpeta necesita permisos de administrador. Elegí una donde puedas escribir: así las actualizaciones no tienen que pedir permiso cada vez."
    }

    if ($problema) {
        [System.Windows.Forms.MessageBox]::Show(
            $problema, "AppPack",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        return
    }

    $script:destino = $propuesta
    MostrarBienvenida
}

function MostrarBienvenida {
    $cuerpo.Controls.Clear()

    $faltan = LoQueFalta
    if ($faltan.Count -gt 0) {
        $cuerpo.Controls.Add((Texto "Al paquete le faltan archivos" 36 28 500 26 $Rojo (Letra 12)))
        $cuerpo.Controls.Add((Texto ("Esta carpeta está incompleta, así que instalar dejaría un programa que no " +
            "abre. Volvé a copiarla entera desde donde la trajiste.") 36 60 520 46 $Suave $null))
        $cuerpo.Controls.Add((Texto ("Falta: " + ($faltan -join ", ")) 36 112 520 60 $Suave (Letra 9)))

        $aceptar.Enabled = $false
        $aceptar.BackColor = [System.Drawing.Color]::FromArgb(190, 190, 195)
        return
    }

    if (-not $node) {
        $cuerpo.Controls.Add((Texto "Falta Node.js" 36 28 500 26 $Rojo (Letra 12)))
        $cuerpo.Controls.Add((Texto ("AppPack lo necesita para funcionar. Es gratis, lo publica la fundación OpenJS " +
            "y se instala en un minuto. Después de instalarlo, volvé a abrir este asistente.") 36 60 520 56 $Suave $null))

        $instalarNode = New-Object System.Windows.Forms.Button
        $instalarNode.Text = "Instalar Node.js"
        $instalarNode.Size = New-Object System.Drawing.Size(160, 36)
        $instalarNode.Location = New-Object System.Drawing.Point(36, 126)
        $instalarNode.FlatStyle = "Flat"
        $instalarNode.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(210, 210, 215)
        $instalarNode.BackColor = $Blanco
        $instalarNode.Cursor = "Hand"
        $instalarNode.Add_Click({
            Start-Process "winget" -ArgumentList "install", "OpenJS.NodeJS.LTS" -Wait -ErrorAction SilentlyContinue
            $script:node = BuscarNode
            MostrarBienvenida
        })
        $cuerpo.Controls.Add($instalarNode)

        $aceptar.Enabled = $false
        $aceptar.BackColor = [System.Drawing.Color]::FromArgb(190, 190, 195)
        return
    }

    $aceptar.Enabled = $true
    $aceptar.BackColor = $Azul

    $encabezado = if ($script:yaEstaba) {
        "Se va a actualizar a la versión $version"
    } else {
        "Se va a instalar en esta computadora"
    }
    $cuerpo.Controls.Add((Texto $encabezado 36 26 520 26 $Tinta (Letra 12)))

    $script:rutaMostrada = Texto $script:destino 36 56 400 22 $Suave (Letra 9)
    $cuerpo.Controls.Add($script:rutaMostrada)

    # Actualizar no muda el programa de lugar: si ya está instalado, la carpeta
    # es la que es y cambiarla dejaría dos copias.
    if (-not $script:yaEstaba) {
        $cambiar = New-Object System.Windows.Forms.Button
        $cambiar.Text = "Cambiar…"
        $cambiar.Size = New-Object System.Drawing.Size(96, 26)
        $cambiar.Location = New-Object System.Drawing.Point(444, 54)
        $cambiar.FlatStyle = "Flat"
        $cambiar.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(210, 210, 215)
        $cambiar.BackColor = $Blanco
        $cambiar.Cursor = "Hand"
        $cambiar.Add_Click({ ElegirCarpeta })
        $cuerpo.Controls.Add($cambiar)
    }

    # Una carpeta que necesita administrador rompe todo lo que viene después: la
    # actualización automática pediría permisos cada vez, y el cartel de Control
    # de cuentas volvería a aparecer. Se rechaza y se explica, en vez de
    # instalar algo que después no se puede mantener.
    if (-not (PuedeEscribir $script:destino)) {
        $cuerpo.Controls.Add((Texto "Ahí no se puede instalar" 36 84 520 24 $Rojo (Letra 11)))
        $cuerpo.Controls.Add((Texto ("Esa carpeta necesita permisos de administrador. Elegí una donde puedas " +
            "escribir —tu carpeta de usuario, o cualquier carpeta de otro disco— para que las " +
            "actualizaciones no tengan que pedir permiso cada vez.") 36 108 520 48 $Suave (Letra 9)))

        $aceptar.Enabled = $false
        $aceptar.BackColor = [System.Drawing.Color]::FromArgb(190, 190, 195)
        return
    }

    $script:conEscritorio = New-Object System.Windows.Forms.CheckBox
    $script:conEscritorio.Text = "Crear un acceso directo en el escritorio"
    $script:conEscritorio.Checked = $true
    $script:conEscritorio.Location = New-Object System.Drawing.Point(34, 96)
    $script:conEscritorio.Size = New-Object System.Drawing.Size(500, 26)
    $cuerpo.Controls.Add($script:conEscritorio)

    $script:abrirAlFinal = New-Object System.Windows.Forms.CheckBox
    $script:abrirAlFinal.Text = "Abrir AppPack al terminar"
    $script:abrirAlFinal.Checked = $true
    $script:abrirAlFinal.Location = New-Object System.Drawing.Point(34, 124)
    $script:abrirAlFinal.Size = New-Object System.Drawing.Size(500, 26)
    $cuerpo.Controls.Add($script:abrirAlFinal)

    $cierre = if ($script:yaEstaba) {
        "Si AppPack está abierto se cierra solo para actualizarlo. Tus datos no se tocan: " +
        "viven aparte del programa, en $datos."
    } else {
        "No hace falta ser administrador. Tus datos se guardan aparte del programa, " +
        "en $datos, y no se tocan al actualizar ni al desinstalar."
    }
    $cuerpo.Controls.Add((Texto $cierre 36 162 520 50 $Suave (Letra 9)))
}

# ── Paso 2: copiando ────────────────────────────────────────────────

function MostrarProgreso {
    $cuerpo.Controls.Clear()
    $cancelar.Enabled = $false
    $aceptar.Enabled = $false
    $aceptar.BackColor = [System.Drawing.Color]::FromArgb(190, 190, 195)

    $cuerpo.Controls.Add((Texto $(if ($script:yaEstaba) { "Actualizando…" } else { "Instalando…" }) 36 40 500 26 $Tinta (Letra 12)))

    $script:barra = New-Object System.Windows.Forms.ProgressBar
    $script:barra.Location = New-Object System.Drawing.Point(36, 84)
    $script:barra.Size = New-Object System.Drawing.Size(524, 10)
    $script:barra.Style = "Continuous"
    $cuerpo.Controls.Add($script:barra)

    $script:detalle = Texto "" 36 104 524 22 $Suave (Letra 8.5)
    $cuerpo.Controls.Add($script:detalle)

    $ventana.Refresh()
}

# ── Paso 3: listo ───────────────────────────────────────────────────

function MostrarFinal {
    $cuerpo.Controls.Clear()

    $verbo = if ($script:yaEstaba) { "actualizó" } else { "instaló" }
    $cuerpo.Controls.Add((Texto "AppPack se $verbo" 36 40 520 30 $Tinta (Letra 14)))
    $cuerpo.Controls.Add((Texto ("Se abre desde el escritorio o buscando AppPack en el menú Inicio. " +
        "Aparece en su propia ventana; cerrarla apaga el programa.") 36 78 524 46 $Suave $null))
    $cuerpo.Controls.Add((Texto ("Tus datos quedan en $datos. Para desinstalarlo: Configuración, " +
        "Aplicaciones, Aplicaciones instaladas.") 36 132 524 46 $Suave (Letra 9)))

    $cancelar.Visible = $false
    $aceptar.Enabled = $true
    $aceptar.BackColor = $Azul
    $aceptar.Text = "Finalizar"
}

# ── El botón ────────────────────────────────────────────────────────

$script:paso = "bienvenida"

$aceptar.Add_Click({
    if ($script:paso -eq "final") {
        if ($script:abrirAlFinal.Checked) { AbrirAppPack }
        $ventana.Close()
        return
    }

    $conEscritorio = $script:conEscritorio.Checked
    $script:paso = "instalando"
    MostrarProgreso

    try {
        CerrarLoAbierto

        CopiarPrograma -Avisar {
            param($porcentaje, $archivo)
            $script:barra.Value = [Math]::Min($porcentaje, 100)
            $script:detalle.Text = $archivo
            [System.Windows.Forms.Application]::DoEvents()
        }

        CrearAccesos $conEscritorio
        AnotarEnWindows

        # Cantar victoria sin mirar es como no haber comprobado nada.
        if (-not (QuedoBien)) {
            throw "La copia terminó pero faltan archivos en $destino. Probá de nuevo."
        }

        $script:paso = "final"
        MostrarFinal
    } catch {
        $cuerpo.Controls.Clear()
        $cuerpo.Controls.Add((Texto "No se pudo instalar" 36 40 520 28 $Rojo (Letra 12)))
        $cuerpo.Controls.Add((Texto $_.Exception.Message 36 74 524 90 $Suave (Letra 9)))
        $cancelar.Visible = $false
        $aceptar.Text = "Cerrar"
        $aceptar.Enabled = $true
        $aceptar.BackColor = $Azul
        $script:paso = "error"
    }
})

MostrarBienvenida

# Enter avanza y Escape cancela, como en cualquier ventana del sistema.
$ventana.AcceptButton = $aceptar
$ventana.CancelButton = $cancelar

$ventana.Add_Shown({
    EsconderConsola
    $ventana.Activate()
})
[void]$ventana.ShowDialog()
