# Visual App

Stock, caja y ventas para un negocio chico. Es una **aplicación de escritorio
para Windows**: se instala con `Visual-App-Setup.exe`, se abre desde el menú
Inicio o el escritorio, y se actualiza sola desde GitHub Releases.

No hay base de datos que instalar, ni cuenta en la nube, ni conexión a internet
para trabajar. La computadora no necesita Node.js, Git ni ningún navegador.

```
Visual App.exe                      Electron: la ventana y el proceso principal
  ├── electron/main.js              arranca el servidor, abre la ventana, actualiza
  ├── electron/preload.js           lo único de la app que ve la página
  ├── servidor/  (compilado)        API y reglas del negocio · 127.0.0.1:5177
  ├── out/                          la interfaz de Next ya compilada
  └── datos.json                    %LOCALAPPDATA%\Visual App\
```

## Cómo funciona

Al abrir `Visual App.exe` aparece una pantalla de **"Cargando…"** con el logo
mientras el proceso principal de Electron arranca el servidor **adentro de sí
mismo** —no hay un segundo programa, ni consola, ni PowerShell— y después la
ventana del programa, con su ícono y su lugar en la barra de tareas.

El servidor sigue siendo HTTP (en `127.0.0.1`, o en la red del local si se
prende el acceso desde el celular) porque el teléfono del mostrador entra por
el wifi a esa misma dirección. La ventana lo usa igual que el celular.

**Cerrar la ventana cierra el programa.** Una sola copia abierta a la vez: un
segundo doble clic trae al frente la ventana que ya estaba, porque dos procesos
escribiendo el mismo archivo lo dejarían con lo que guardó el último.

### Seguridad de la ventana

- `contextIsolation: true`, `nodeIntegration: false` y `sandbox: true`: la página
  no tiene Node, ni `require`, ni acceso al disco.
- `electron/preload.js` expone **solo** `window.visualApp.actualizacion`
  (estado, buscar, descargar, instalar). Cada mensaje lo valida el proceso
  principal: tiene que venir de la ventana del programa y de su propio origen.
- La ventana no navega fuera del programa. Los enlaces `https:` se abren en el
  navegador de la computadora; cualquier otra cosa se descarta.
- Todos los permisos del navegador (cámara, micrófono, ubicación,
  notificaciones) se niegan, salvo copiar al portapapeles.
- Sin menú ni herramientas de desarrollo en el programa instalado.

### Lo que antes hacía Windows por PowerShell

| Antes (hasta 2.0.0) | Ahora |
| --- | --- |
| `Abrir Visual App.cmd` → PowerShell → `node` → Edge en modo aplicación | `Visual App.exe` |
| Un "latido" cada 20 s para que el servidor se apague al cerrar Edge | Cerrar la ventana cierra el proceso |
| Cuadro de "elegir carpeta" con PowerShell | `dialog.showOpenDialog` de Electron |
| Abrir la carpeta de datos con `explorer.exe` | `shell.openPath` |
| Instalador y desinstalador en PowerShell | NSIS, generado por electron-builder |
| Actualizador propio: `version.json` + zip + PowerShell | electron-updater + GitHub Releases |

El servidor no importa Electron: lo que necesita de Windows se lo pide al
programa que lo contiene (`servidor/anfitrion.ts`). Así las rutas se siguen
probando con Vitest sin ventanas.

## Los datos

Siguen en **`%LOCALAPPDATA%\Visual App\datos.json`**, la misma carpeta que usaba
la versión de PowerShell: ahí están los datos de todos los que ya la usaban.

**Desinstalar no borra los datos.** Reinstalar los encuentra donde estaban.

Para probar sin tocar los datos de verdad, se puede elegir otra carpeta:

```powershell
$env:VISUALAPP_DATOS = "C:\prueba"; & "Visual App.exe"
```

## Desarrollarlo

Hace falta **Node.js 22 o más nuevo** (`winget install OpenJS.NodeJS.LTS`).

```bash
npm install
npm run dev
```

`npm run dev` abre la aplicación de escritorio en modo desarrollo: arranca el
servidor desde el TypeScript sin compilar, levanta `next dev` con recarga en
caliente y abre la ventana contra él. F12 abre las herramientas de desarrollo.
Al cerrar la ventana se cierra todo.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | La aplicación de escritorio, en desarrollo |
| `npm run build` | Compila la interfaz (`out/`) y el servidor (`compilado/`) |
| `npm run dist` | Arma el instalador en `dist/` |
| `npm run publicar` | Arma y publica en GitHub Releases (lo usa GitHub Actions) |
| `npm run web` | Solo la interfaz, en el navegador (necesita `npm run servidor`) |
| `npm run servidor` | Solo el servidor, sin ventana |
| `npm run icono` | Regenera `build/icon.ico` desde el arte de la marca |
| `npm run typecheck` | TypeScript, interfaz y servidor |
| `npm run lint` | ESLint |
| `npm test` | Vitest |

## Armar el instalador

```bash
npm run dist
```

Deja en `dist/`:

```
Visual-App-Setup.exe                  el instalador
Visual-App-Setup.exe.blockmap         para que las actualizaciones bajen solo lo que cambió
latest.yml                            lo que lee la actualización automática
win-unpacked/                         el programa sin instalar, para revisarlo
```

El instalador (NSIS, en español):

- deja elegir la carpeta; por omisión `%LOCALAPPDATA%\Programs\Visual App`;
- instala para el usuario, **sin pedir permisos de administrador** — igual que
  Discord o Spotify, y es lo que permite actualizar sin el cartel de UAC;
- crea el acceso directo del menú Inicio y el del escritorio;
- lo registra en *Configuración → Aplicaciones → Aplicaciones instaladas*, con
  su desinstalador;
- ofrece abrir el programa al terminar.

La configuración está en [`electron-builder.yml`](electron-builder.yml). Lo que
viaja adentro es la interfaz compilada, el servidor compilado, `electron/` y
`electron-updater`: ni el código fuente, ni Next, ni React. Por eso `next`,
`react` y compañía están en `devDependencies`: solo hacen falta para compilar.

## Publicar una versión

1. Cambiar la versión en `package.json` siguiendo
   [Semantic Versioning](https://semver.org/lang/es/):
   `3.0.1` para arreglos, `3.1.0` para funciones nuevas, `4.0.0` para cambios
   que rompen algo. Es la única versión que hay: la leen electron-builder,
   electron-updater, Windows y la pantalla de Configuración.

   ```bash
   npm version 3.0.1 --no-git-tag-version
   ```

2. Commit y etiqueta:

   ```bash
   git commit -am "Visual App 3.0.1"
   git tag v3.0.1
   git push origin main v3.0.1
   ```

3. GitHub Actions ([`.github/workflows/publicar.yml`](.github/workflows/publicar.yml))
   comprueba que la etiqueta coincida con `package.json`, corre los tipos y las
   pruebas, arma el instalador y crea la publicación con
   `Visual-App-Setup.exe`, su `.blockmap` y `latest.yml` adjuntos.

No hay que cargar ningún secreto para esto: el `GITHUB_TOKEN` lo crea GitHub en
cada ejecución. Solo la firma de código (abajo) usa secretos, y es opcional.

Para pasarle el programa a alguien nuevo, este enlace baja siempre la última
versión:

<https://github.com/Manota14-cpu/visual-app/releases/latest/download/Visual-App-Setup.exe>

## Que la versión nueva llegue sola

El programa instalado busca versiones nuevas en GitHub Releases unos segundos
después de abrir y cada seis horas. Si hay una, se lo avisa **al dueño**, arriba
de cualquier pantalla:

> **Hay una nueva versión disponible.** Versión actual: 3.0.0 · Nueva versión: 3.0.1
> [Más tarde] [Actualizar ahora]

"Actualizar ahora" la baja mostrando el porcentaje, y al terminar ofrece
**Reiniciar y actualizar**: el programa se cierra, se instala la versión nueva
sin asistente y vuelve a abrirse solo. Los datos no se tocan.

Tres decisiones:

- **Nunca se baja ni se instala sin que el dueño lo pida.** Esto es una caja
  registradora: una actualización que arranca sola a mitad de un turno es lo
  peor que puede pasar.
- **Si quedó bajada, se instala al cerrar.** Si el dueño bajó la versión pero
  siguió trabajando, se instala sola la próxima vez que se cierra el programa.
- **Quien atiende no ve el aviso.** No le toca decidir reiniciar la caja.

Lo mismo está en *Configuración → Programa → Actualizaciones*, con un botón para
buscar a mano. El detalle técnico de cada búsqueda queda en
`actualizaciones.log`, al lado de los datos.

electron-updater verifica el SHA-512 de lo que baja contra `latest.yml`: si no
coincide, no se instala nada.

## Firmar el instalador

**El instalador y el programa salen sin firma digital**, porque firmar requiere
un certificado de firma de código que se compra a una autoridad reconocida. Sin
firma, Windows reacciona así:

- **Windows SmartScreen** (todas las computadoras): al abrir el instalador
  bajado de internet aparece *"Windows protegió su PC"*. Se sigue con *Más
  información → Ejecutar de todas formas*. Con un certificado, el aviso
  desaparece a medida que el certificado gana reputación.
- **Control inteligente de aplicaciones** (Smart App Control, solo en algunas
  instalaciones nuevas de Windows 11): **puede bloquear el programa sin ofrecer
  forma de seguir**. Con archivos sin firma decide archivo por archivo, sin un
  criterio previsible: en las pruebas, un `.exe` armado corrió y otro armado
  minutos después, igual de sin firma, quedó bloqueado. Es el único caso en que
  la firma no es opcional.

Para saber si una computadora lo tiene activo:

```powershell
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy").VerifiedAndReputablePolicyState
```

`0` es apagado, `1` es bloqueando, `2` es evaluando.

Cuando haya certificado, se carga en GitHub como secretos
(*Settings → Secrets and variables → Actions → New repository secret*) y el
workflow firma solo:

| Secreto | Qué va |
| --- | --- |
| `CSC_LINK` | El certificado `.pfx` en base64 (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))`) |
| `CSC_KEY_PASSWORD` | La contraseña del `.pfx` |

Los certificados emitidos desde 2023 suelen venir en un token físico o en la
nube, y no como `.pfx`. En ese caso se firma con la herramienta del emisor, que
electron-builder acepta con `win.signtoolOptions.sign` en `electron-builder.yml`.

## Cambiar el ícono o el nombre

**El ícono** sale de `build/icon.ico`. Para cambiarlo, reemplazar ese archivo
por otro `.ico` con al menos 256 × 256 px —o regenerarlo desde el arte con
`npm run icono`— y volver a armar. La marca de adentro de la interfaz es
`public/marca.svg`.

**El nombre** está en tres lugares que tienen que coincidir:

- `productName` en `package.json` y en `electron-builder.yml` (nombre del `.exe`,
  del acceso directo y de "Aplicaciones instaladas"), y `executableName` y
  `shortcutName` en `electron-builder.yml`;
- `NOMBRE` en `electron/main.js` (título de la ventana y pantalla de carga);
- los textos de la interfaz (`app/layout.tsx`, `components/marco.tsx`,
  `app/ingresar/page.tsx`).

No cambiar `appId` (`com.visualsolution.visualapp`): es lo que Windows usa para saber
que una versión nueva es el mismo programa. Cambiarlo instala uno aparte.

## Desde Visual App 2.0.0 o anterior

Las computadoras con la versión anterior (la de PowerShell) **no pasan solas** a
esta: su actualizador busca otro tipo de archivo que las publicaciones nuevas ya
no traen. Hay que instalar `Visual-App-Setup.exe` una vez, y el instalador
retira la versión vieja solo (`build/installer.nsh`):

- borra sus archivos (`servidor\`, `sitio\`, los `.ps1` y los `.cmd`), que no
  se pisan con ninguno del programa nuevo aunque estén en la misma carpeta;
- borra su renglón de *Aplicaciones instaladas*, para que no queden dos
  "Visual App" — y para que nadie desinstale la vieja y se lleve la carpeta
  con el programa nuevo adentro;
- borra el Node que traía (`%LOCALAPPDATA%\Visual App\runtime`).

Lo hace después de instalar: si se cancela, la vieja queda como estaba. Los
datos se usan tal cual (es la misma carpeta).

Si la versión vieja está abierta, Visual App lo detecta al arrancar y pide
cerrarla: las dos escribirían el mismo archivo.

## Las pantallas

| Ruta | Qué hace |
| --- | --- |
| `/panel` | Vendido hoy, valor del stock, qué reponer, últimos movimientos |
| `/caja` | Turno de caja: cobrar, devolver, retiros e ingresos, cierre con arqueo |
| `/productos` | Catálogo, stock, categorías, precios masivos, historial, exportar e importar |
| `/ventas` | Todas las ventas, su ficha, cambios de estado y edición de renglones |
| `/clientes` | Agenda con lo que compró cada uno |
| `/gastos` | Lo que sale, separando la compra de mercadería del gasto operativo |
| `/informes` | Qué se vendió, con cuánto margen, y qué capital quedó quieto |
| `/movimientos` | Historial completo de stock |
| `/configuracion` | El archivo de datos, sus copias y el nombre del negocio |
| `/comprobante?venta=…` | El ticket para imprimir |

## El video

[`video/visual-app.mp4`](video/visual-app.mp4) es la presentación del programa:
45 segundos en vertical (9:16), con las pantallas de verdad animadas y música
propia. Cómo está hecho y cómo volver a armarlo, en [`video/`](video/README.md).

## Cómo está organizado

```
app/            pantallas (Next, App Router, todo del lado del cliente)
components/     marco, piezas de interfaz, íconos y gráficos propios
lib/            cliente de la API, tipos, formato de números y fechas
electron/       la aplicación de escritorio
  main.js       proceso principal: servidor, ventana, actualizaciones
  preload.js    el puente con la página (solo actualizaciones)
servidor/       el backend
  aplicacion.ts arranca el servidor HTTP con todas sus rutas
  anfitrion.ts  lo que el servidor le pide al programa que lo contiene
  index.ts      el servidor solo, sin ventana (npm run servidor)
  tipos.ts      el modelo de datos
  almacen.ts    el archivo JSON: cargar, guardar y volver atrás
  reglas.ts     las reglas del negocio
  http.ts       ruteador y utilidades, sin dependencias
  csv.ts        leer y escribir planillas, sin dependencias
  lanzar.ts     abrir otro programa sin arriesgar este
  sitio.ts      la interfaz compilada, servida desde el disco
  api/          endpoints, uno por área
build/          recursos del instalador (icon.ico)
herramientas/   el generador del ícono
video/          el video de presentación y lo que lo arma
.github/        el workflow que publica cada versión
electron-builder.yml   cómo se arma el instalador
```

El servidor no usa ninguna dependencia: solo los módulos que trae Node. La
única dependencia que viaja en el instalador es `electron-updater`.

## El aspecto

Superficies blancas apoyadas sobre un gris muy claro, esquinas amplias, sombras
en dos capas —una cerca para apoyar, otra lejos y muy abierta para separar del
fondo— y un solo azul, el del logo, para todo lo accionable. La tipografía es
la del sistema operativo: SF en Mac, Segoe UI Variable en Windows.

**Dónde va el vidrio.** La barra lateral, el encabezado y la barra inferior del
teléfono son vidrio esmerilado: el contenido pasa por detrás al desplazarse y se
ve difuminado. Los menús desplegables, los avisos y las ventanas modales son
blancos sólidos: caen encima de texto, y dos capas de letras superpuestas no se
leen. Lo que los despega de la página es la sombra. Es la misma regla que sigue
macOS.

## Decisiones que conviene conocer

**Los datos son un archivo.** `%LOCALAPPDATA%\Visual App\datos.json`, con sangría y
tildes, abrible con el Bloc de notas. Copiarlo a un pendrive es todo el respaldo;
ponerlo en otra computadora es toda la mudanza. Desde *Configuración* se puede
hacer una copia fechada o abrir la carpeta.

**Mudar el catálogo.** *Productos → Exportar e importar* baja el catálogo como
un `.csv` —código, nombre, categoría, unidad, costo, precio, stock y mínimo— y
vuelve a cargarlo. Es para mudarse de computadora, para entrar por primera vez
con una lista que ya estaba en Excel, o para corregir doscientos precios sentado
en una planilla.

Tres cosas que lo hacen usable de verdad:

- **El stock del archivo es el que tiene que quedar, no el que se suma.** El
  programa calcula la diferencia y la mueve con `ajustarStock`, así que la
  importación deja sus movimientos con motivo, como cualquier ajuste hecho a
  mano. Escribir el número derecho sería más corto y dejaría el historial
  mintiendo.
- **Primero se mira, después se aplica.** La pantalla muestra fila por fila qué
  va a pasar —cuál es nueva, cuál cambia de precio, cuál no se entiende y por
  qué— y recién ahí aparece el botón. Un archivo de trescientas filas que entra
  solo es una forma cara de romper un catálogo.
- **La codificación se adivina.** Excel en Windows, con «Guardar como → CSV»,
  no escribe UTF-8: escribe la codificación vieja de Windows. Leído como UTF-8
  —lo que hace el navegador solo— cada acento se vuelve un rombo negro, y el
  archivo *igual se entiende*: entraba sin marcar un solo error y renombraba el
  catálogo a «Bandeja pl�stica». Ahora se prueba primero UTF-8 con las reglas
  estrictas puestas; si el archivo no las cumple, era la otra. Un `.xlsx` se
  reconoce por su firma de ZIP y se explica qué hacer, en vez de fallar por un
  encabezado que no existe. Y el servidor rechaza cualquier texto que llegue con
  rombos, por si acaso.
- **El encabezado no tiene que ser el nuestro.** Nadie escribe «stock» a secas:
  escribe «Stock actual», «Cantidad en stock», «Existencia disponible». Primero
  se busca el nombre exacto en una lista, y lo que no está se resuelve por el
  pedazo que lo delata, probando de lo más específico a lo más general — «stock
  mínimo» tiene que caer en el mínimo antes de que la palabra «stock» se lo
  lleve, y «precio de costo» en el costo antes de que se lo lleve «precio». Si
  dos columnas apuntan al mismo campo gana la que lo dijo con todas las letras,
  no la que venía primero. El separador se detecta (Excel en español guarda con
  punto y coma) y las columnas que falten dejan ese campo como estaba. Las filas
  que no se entienden se saltean y se informan; el resto entra igual.
- **La pantalla dice qué entendió.** Lista las columnas que leyó y las que
  ignoró, con el nombre que traían. Y si el archivo no trae ninguna columna de
  stock lo avisa antes de aplicar: no tocar el stock es lo correcto cuando no
  hay dato, pero es lo contrario de lo que espera quien trajo el archivo
  justamente para cargarlo.

Se busca el producto por SKU, después por código de barras y al final por
nombre exacto. Lo que no aparece se crea —se puede apagar— junto con las
categorías que nombre.

**Nada queda a medias.** Un cobro toca la venta, sus pagos y el stock de varios
productos. `Almacen.escribir` guarda el estado anterior antes de tocar nada y lo
restaura si algo falla, que es lo que una base hacía con una transacción. El
archivo se escribe en un temporal y recién ahí se reemplaza, así un corte de luz
no deja un JSON truncado.

**El stock nunca se escribe directo.** Todo cambio pasa por `ajustarStock`, que
valida que no quede negativo y deja el movimiento con su motivo y con cuánto
quedó el producto. Por eso el campo Stock está deshabilitado al editar: para
moverlo hay que decir por qué.

**El efectivo del arqueo sale de los pagos, no de la etiqueta.** En una venta
pagada mitad y mitad la etiqueta dice «mixto» y el cajón recibió solo una parte.
Las devoluciones se guardan como ventas con importe negativo, así toda suma que
ya existía les da el signo correcto sin ningún caso especial.

**Lo que pasó por una caja cerrada no se toca.** Editar, borrar o cancelar una
venta de un turno ya arqueado reescribiría un cierre que alguien dio por bueno.
La aplicación lo impide y propone registrar una devolución.

**Comprar mercadería no es una pérdida.** Son pesos que se cambiaron por cajas
que están en la estantería, y se vuelven costo cuando esa mercadería se vende
—momento en el que el informe ya los cuenta como costo de lo vendido—. Por eso
el resultado del período resta los gastos operativos y no las compras.

**Un costo en cero es "todavía no lo sé".** Se guarda nulo, no cero: con cero el
margen daría 100% y el valor del inventario mentiría sin que nada avise.

**Una sola instancia.** Dos procesos escribiendo el mismo archivo lo dejarían con
lo que guardó el último. Un segundo doble clic trae al frente la ventana que ya
estaba; y si el puerto lo tiene la versión anterior (Visual App), se avisa y no
se abre.

**Escuchar en 127.0.0.1 no alcanza para estar cerrado.** Cualquier página web
abierta en el navegador corre *en* esta computadora, y puede mandarle pedidos:
un `fetch` con `Content-Type: text/plain` no dispara consulta previa, así que
llega y se ejecuta; lo único que el navegador impide después es leer la
respuesta. Con eso, un sitio cualquiera podía vaciar la base entera. El servidor
mira ahora dos cabeceras que la página no puede falsificar —`Origin`, de qué
sitio salió el pedido, y `Host`, por qué nombre se llegó— y contesta 403 a lo
que no venga de esta computadora. La interfaz propia y el Next de desarrollo
pasan; `curl` y las navegaciones normales, que no mandan `Origin`, también.

**Una devolución no se edita.** Está guardada al revés —cantidades, total y
pagos negativos—, que es lo que hace que el arqueo y los informes la resten sin
ningún caso especial. El editor de ventas solo sabe escribir ventas: guardarla
ahí la daba vuelta, y una devolución de $20.700 pasaba a sumar al cajón en vez
de restar. Se borra y se registra de nuevo desde la caja.

**Abrir otro programa no puede apagar este.** Un `spawn` que falla no lanza una
excepción: avisa con un evento `error`, y un evento `error` que nadie escucha
termina el proceso. Envuelto en `try/catch` parecía cubierto y no lo estaba. Que
no abra el explorador de archivos es un incordio; que se apague el programa con una
venta a medio cobrar, no.

**Del diálogo, solo el fondo cierra.** Un clic sobre el fondo de un `<dialog>`
modal llega con el propio diálogo como destino; lo de adentro sube por burbujeo.
Mirar solo las coordenadas no alcanzaba: un clic que no hizo el mouse llega en
(0, 0), que siempre cae fuera del rectángulo. Con eso, Enter sobre cualquier
botón cerraba el diálogo — y «Elegir archivo», que dispara un clic sobre un
campo escondido, lo cerraba justo antes de poder elegir nada.

**Los avisos van en la capa superior del navegador.** Un `<dialog>` se pinta por
encima de todo el documento, así que un error levantado desde adentro de un
formulario quedaba tapado y la aplicación parecía no responder. El contenedor de
avisos usa la API de *popover*, que lo sube a esa misma capa.

## Lo que se sacó

Esta versión reemplaza a un panel que corría en Vercel contra PostgreSQL en Neon.
Se retiraron, además de la base:

- **Importar y exportar Excel** (ExcelJS). Volvió, pero como CSV y sin
  dependencia: ver *Mudar el catálogo*. Lo que se fue es la biblioteca de
  planillas y el `.xlsx` con formato, que pesaban más que todo el resto del
  programa junto.
- **Fotos de producto** subidas a Vercel Blob.
- **Avisos por correo y webhook** y la tarea diaria programada: dependían de
  servicios externos que una aplicación de escritorio no tiene.
- **Sincronización con la tienda web**: ya no hay dos aplicaciones mirando la
  misma tabla.

## Licencia y autoría

**Visual App** es un producto de **Visual Solution**.

<https://visual-solution.vercel.app>

Copyright © 2026 Visual Solution. Todos los derechos reservados.

Que el código esté publicado no lo vuelve libre: se publica para que quien use
el programa pueda ver qué hace con su información, y para poder distribuir las
actualizaciones. Las condiciones están en [LICENSE](LICENSE).

Los datos que carga cada negocio son de ese negocio: quedan en su computadora,
Visual Solution no los recibe ni puede verlos.
