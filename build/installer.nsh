; =====================================================================
;  Pasos propios del instalador de Visual App (electron-builder los incluye)
; =====================================================================

; ---------------------------------------------------------------------
;  Pasar desde la Visual App de PowerShell (2.0.0 y anteriores)
; ---------------------------------------------------------------------
;
;  La versión anterior se instalaba con un script en
;  %LOCALAPPDATA%\Programs\Visual App —la misma carpeta que usa esta— y se
;  anotaba en "Aplicaciones instaladas" con la clave VisualApp. Si se la deja:
;
;    - quedan dos "Visual App" en Aplicaciones instaladas;
;    - y desinstalar la vieja borraría la carpeta entera, con el programa
;      nuevo adentro.
;
;  Por eso, recién DESPUÉS de instalar (si se cancela, la vieja queda como
;  estaba), se borra lo que era solo de la versión vieja. Son nombres que el
;  programa nuevo no usa, así que no se pisa nada. Los accesos directos del
;  menú Inicio y del escritorio se llaman igual y ya los reemplazó el
;  instalador.
;
;  Los datos del negocio (%LOCALAPPDATA%\Visual App\datos.json y sus copias)
;  no se tocan: el programa nuevo los usa tal cual.
;
;  No se llama al desinstalador viejo a propósito: borra la carpeta con un
;  `rmdir` que corre tres segundos después de terminar, y se llevaría los
;  archivos que este instalador acaba de copiar.

!define CLAVE_VIEJA "Software\Microsoft\Windows\CurrentVersion\Uninstall\VisualApp"

!macro customInstall
  ReadRegStr $0 HKCU "${CLAVE_VIEJA}" "InstallLocation"

  ; Solo si la carpeta anotada es de verdad la versión vieja (tiene su
  ; servidor adentro), y nunca la carpeta de los datos.
  ${if} $0 != ""
  ${andIf} $0 != "$LOCALAPPDATA\Visual App"
  ${andIf} ${FileExists} "$0\servidor\index.js"
    RMDir /r "$0\servidor"
    RMDir /r "$0\sitio"
    RMDir /r "$0\Visual App.nuevo"
    Delete "$0\abrir.ps1"
    Delete "$0\actualizar.ps1"
    Delete "$0\desinstalar.ps1"
    Delete "$0\instalar.ps1"
    Delete "$0\Abrir Visual App.cmd"
    Delete "$0\Instalar Visual App.cmd"
    Delete "$0\Visual App.ico"
    Delete "$0\version.txt"
    ; Si la vieja estaba en otra carpeta, queda vacía y se va. Si era esta
    ; misma, tiene el programa nuevo adentro y RMDir sin /r no la toca.
    RMDir "$0"
  ${endIf}

  DeleteRegKey HKCU "${CLAVE_VIEJA}"

  ; El Node que traía la versión vieja (88 MB). Este programa trae su motor
  ; adentro y no lo usa. Es lo mismo que borraba el desinstalador viejo.
  RMDir /r "$LOCALAPPDATA\Visual App\runtime"
!macroend
