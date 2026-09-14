# Visual App

Panel de stock, caja y ventas para un negocio chico. Corre en la propia
computadora: un servidor local sirve la interfaz, atiende la API y guarda todo
en un archivo JSON.

No hay base de datos que instalar, ni cuenta en la nube, ni conexión a internet.
Se abre con doble clic y se cierra cerrando la ventana.

```
Abrir Visual App.cmd
   ├── servidor/   Node: API y reglas del negocio     escucha en 127.0.0.1
   ├── sitio/      la interfaz de Next ya compilada
   └── datos.json  %LOCALAPPDATA%\Visual App\
```

## Se abre como una aplicación, no como una página

Al abrirlo aparece **una ventana propia**: barra de título con el ícono, su lugar
en la barra de tareas, y ni barra de direcciones ni pestañas. Adentro no hay
consola negra dando vueltas.

Eso lo hace el modo aplicación de Edge o Chrome (`--app=`), que dibuja la
interfaz sin el resto del navegador. El perfil va aparte, en la carpeta de datos,
así la ventana no arrastra las pestañas ni la sesión de quien esté navegando y
Windows la agrupa como un programa distinto. Si no hubiera ninguno de los dos
—raro en Windows— se cae al navegador por omisión.

**Cerrar la ventana cierra el programa.** La interfaz avisa cada veinte segundos
que sigue abierta; si pasa un minuto y medio sin noticias, el servidor se apaga
solo. El margen es generoso a propósito: una computadora que se suspende no tiene
que voltear el servidor con una venta a medio cobrar. Para apagarlo en el momento
está *Configuración → Cerrar Visual App*.

## Armarlo

Hace falta **Node.js 20 o más nuevo**:

```bash
winget install OpenJS.NodeJS.LTS
```

Después, en la carpeta del proyecto:

```bash
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Deja la carpeta `dist` (1,4 MB), que es a la vez el instalador y el programa.

## Instalarlo en una computadora

Se copia la carpeta `dist` a la máquina y se hace doble clic en
**`Instalar Visual App.cmd`**. Se abre un asistente con ventana —bienvenida, barra
de progreso y aviso de finalizado— que:

- copia el programa a `%LOCALAPPDATA%\Programs\Visual App`;
- deja un acceso directo en el menú Inicio y, si se deja tildado, en el
  escritorio, con su ícono;
- lo anota en *Configuración → Aplicaciones → Aplicaciones instaladas*, con su
  desinstalador;
- ofrece abrir Visual App al terminar.

Si falta Node.js, el asistente lo dice en la primera pantalla y ofrece
instalarlo ahí mismo en vez de fallar a mitad de camino.

**No pide permisos de administrador.** Instalar en la carpeta del usuario evita
el cartel de Control de cuentas y deja que el programa escriba sus datos sin
pelear con los permisos de «Archivos de programa».

### Elegir dónde se instala

El asistente propone `%LOCALAPPDATA%\Programs\Visual App` y tiene un botón
*Cambiar…* para llevarlo a otro lado —otro disco, normalmente—. Tres cosas que
no son detalles de forma:

- **Se elige la carpeta padre, y el programa va en una `Visual App` adentro.** El
  desinstalador borra la carpeta del programa entera y sin preguntar: si el
  destino fuera la carpeta elegida a secas, desinstalar desde «Documentos» se
  llevaría Documentos. Además se rechaza la raíz de un disco, las carpetas del
  sistema y cualquier carpeta que ya tenga otra cosa adentro.
- **Se rechazan las carpetas que necesitan administrador**, en vez de pedir
  permisos. Instalar en «Archivos de programa» haría que cada actualización
  automática tuviera que pedir confirmación, y volvería el cartel de Control de
  cuentas que todo lo demás está armado para evitar. Se explica y se propone
  elegir otra.
- **Reinstalar y actualizar no mudan el programa.** La carpeta sale de lo que
  Windows tiene anotado (`InstallLocation`), no de una ruta escrita a mano: si
  no, elegir otra carpeta una vez dejaría dos copias, y la actualización
  automática mudaría el programa a espaldas de todos. El desinstalador, por lo
  mismo, borra la carpeta donde él está.

Antes de borrar, el desinstalador comprueba que la carpeta sea de verdad una
instalación de Visual App —que tenga `servidor\index.js` adentro—. Es barato y es
lo único que separa «desinstalar» de «borrar lo que haya en esa ruta».

Reinstalar encima actualiza la versión: el asistente se da cuenta de que ya está
instalado y lo dice —«Actualizar Visual App», con la versión a la que va—, cierra la
copia abierta, reemplaza los archivos y deja los datos intactos.

**Actualizar no puede dejar a nadie sin programa.** La copia nueva se arma al
lado, en `Visual App.nuevo`, y recién cuando está entera reemplaza a la anterior con
un cambio de nombre, que es instantáneo. Antes se borraba lo viejo y después se
copiaba encima: si la copia se cortaba a la mitad —el disco lleno, el antivirus
tomando un archivo, un pendrive que se desconecta— no quedaba ni lo uno ni lo
otro. Si el reemplazo falla, la instalación anterior vuelve a su lugar.

Antes de empezar comprueba que el paquete esté completo, y al terminar que lo
instalado se pueda abrir. Una carpeta copiada a medias instalaba igual —los
archivos que no encontraba los salteaba— y el programa fallaba después, lejos de
ahí, con un error que no señalaba a nadie.

**Cerrar lo que está abierto se hace por ruta, no por nombre.** Se buscaban
procesos cuya línea de comandos mencionara «Visual App», y eso alcanza para
llevarse puesto cualquier proceso ajeno que solo nombre la palabra — pasó en una
prueba, con la terminal desde la que se estaba probando. Ahora se apunta a la
carpeta instalada y a la del paquete. Además se cierra el lanzador **antes** que
el servidor: se queda esperándolo y, si el servidor muere de golpe, cree que el
programa se cayó y saca un cartel de error en medio de una actualización que
salió bien.

**Al desinstalar, los datos no se borran.** El catálogo, las ventas y los turnos
son del negocio, no del programa: quedan en `%LOCALAPPDATA%\Visual App` y el
desinstalador dice dónde, para copiarlos o borrarlos a mano.

También se puede usar sin instalar nada: **`Abrir Visual App.cmd`** abre el mismo
programa desde donde esté la carpeta.

## Que la versión nueva llegue sola

Cada computadora tiene su copia, así que sin esto actualizar es ir hasta cada
una. En lugar de eso, el programa mira un archivo publicado en internet que dice
cuál es la última versión, y si hay una más nueva lo ofrece en
*Configuración → Actualizaciones*.

**Para publicar una versión**, con GitHub:

```bash
powershell -ExecutionPolicy Bypass -File .\build.ps1 `
  -Notas "Qué cambió, en una línea" `
  -Descargas "https://github.com/Manota14-cpu/visual-app/releases/latest/download/visual-app.zip"
```

Eso deja `publicar\` con dos archivos —`visual-app.zip` y `version.json`— para
subir como adjuntos de una publicación nueva del repositorio. Los nombres no
llevan la versión a propósito: `releases/latest/download/<archivo>` apunta
siempre a la última publicación, así que la dirección nunca cambia y las copias
instaladas no tienen nada que reconfigurar.

La dirección que consultan esas copias está en `servidor/actualizacion.ts`
(`ORIGEN`) y se puede pisar con la variable `VISUALAPP_ACTUALIZACIONES`. Mientras
diga `USUARIO/REPO` la comprobación queda apagada: sin una dirección de verdad
no hay a quién preguntarle, y molestar con un error cada día por algo que nadie
configuró es peor que no hacer nada.

**Tres decisiones que valen la pena conocer:**

- **Nunca se actualiza solo.** Esto es una caja registradora. Una actualización
  que arranca sola a mitad de un turno es lo peor que puede pasar, por más buena
  que sea la versión nueva. Se busca al arrancar y una vez por día, se avisa, y
  se espera a que alguien apriete el botón.
- **El canal es la confianza.** No podemos firmar ejecutables, así que quien
  controle esa dirección controla lo que se instala. Por eso solo se acepta
  HTTPS —salvo contra la propia computadora, que es lo que permite probar el
  mecanismo completo— y el archivo se compara contra el SHA-256 que declara el
  aviso. Si no coincide, no se descomprime ni se instala nada.
- **Instalar no es asunto del actualizador.** Bajar el paquete y reemplazar el
  programa son dos problemas distintos, y el segundo ya estaba resuelto: se
  llama a `instalar.ps1`, con su copia al lado y su reemplazo atómico.

Un detalle que costó encontrar: **el actualizador se lanza con `cmd /c start`,
no con `detached`**. Lo primero que hace es cerrar Visual App, o sea a quien lo
llamó; con `detached` a secas se moría junto con él y la actualización quedaba a
mitad de camino — el paquete bajado y verificado, y el programa sin reemplazar.
Y corre desde la carpeta del paquete nuevo, que es la única que la instalación
no va a tocar: un script no puede pararse sobre el piso que está levantando.

### Por qué el asistente es un script y no un Setup.exe

Por lo mismo que el programa: un `.exe` sin firma digital lo bloquea Smart App
Control, y un instalador bloqueado es peor que no tener instalador. El asistente
está escrito con WinForms sobre PowerShell —firmado por Microsoft— así que abre
en cualquier Windows. La ventana es la misma que daría un Setup compilado; lo
que cambia es quién la dibuja.

Dos detalles de Windows que costaron encontrar, por si aparecen de nuevo:

- **La consola se esconde recién cuando el asistente ya está en pantalla.** A la
  primera ventana que muestra un proceso, Windows le aplica el estado del
  proceso; escondiendo la consola antes, la ventana del asistente heredaba ese
  estado y no aparecía nunca.
- **El desinstalador no se registra con `-WindowStyle Hidden`**, por la misma
  razón: arrancaría oculto y su ventana también.

### El ícono

`herramientas/icono.mjs` dibuja el ícono en seis tamaños y arma el `.ico`, con
funciones de distancia y el `zlib` que ya trae Node. Son cien líneas y evitan
sumar una dependencia de imágenes al proyecto — y que el resultado dependa de
qué fuentes tenga instaladas la máquina que compila.

### Por qué no es un .exe

Lo fue, y no se pudo usar. Windows 11 trae **Control de aplicaciones inteligente**
(Smart App Control), que bloquea cualquier ejecutable sin firma digital — y
también los `.dll` que ese ejecutable cargue. El registro de eventos lo dice
sin vueltas:

> Code Integrity determined that a process attempted to load `Visual App.dll` that
> did not meet the Enterprise signing level requirements

Firmar cuesta un certificado de una autoridad reconocida. Node, en cambio, ya
viene firmado por OpenJS: el mismo programa, ejecutado por `node.exe`, arranca
sin que Windows lo mire de reojo. Por eso el paquete es una carpeta con archivos
`.js` y un `.cmd` que los abre, en vez de un ejecutable propio.

Para comprobar si ese control está activo en una computadora:

```powershell
(Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy").VerifiedAndReputablePolicyState
```

`0` es apagado, `1` es bloqueando, `2` es evaluando.

## Desarrollarlo

Dos procesos, en dos terminales:

```bash
npm run servidor   # API en http://localhost:5177, con recarga al guardar
```

```bash
npm run dev        # interfaz Next en http://localhost:3000
```

La interfaz apunta sola al 5177 cuando corre en desarrollo (`lib/api.ts`); en el
paquete las dos cosas son el mismo origen. El servidor se ejecuta en TypeScript
sin compilar: Node 22.6+ borra los tipos y lo corre tal cual.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Interfaz con recarga en caliente |
| `npm run servidor` | Servidor solo, sin abrir el navegador |
| `npm run build` | Compila la interfaz a `out/` |
| `npm run paquete` | Corre `build.ps1` y arma `dist/` |
| `npm run typecheck` | TypeScript, interfaz y servidor |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |

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

## Cómo está organizado

```
app/            pantallas (Next, App Router, todo del lado del cliente)
components/     marco, piezas de interfaz, íconos y gráficos propios
lib/            cliente de la API, tipos, formato de números y fechas
servidor/       el backend
  tipos.ts      el modelo de datos
  almacen.ts    el archivo JSON: cargar, guardar y volver atrás
  reglas.ts     las reglas del negocio
  http.ts       ruteador y utilidades, sin dependencias
  csv.ts        leer y escribir planillas, sin dependencias
  lanzar.ts     abrir otro programa sin arriesgar este
  sitio.ts      la interfaz compilada, servida desde el disco
  api/          endpoints, uno por área
instalador/     instalar.ps1, desinstalar.ps1 y su lanzador
herramientas/   el generador del ícono
build.ps1       arma dist/
```

El servidor no usa ninguna dependencia: solo los módulos que trae Node.

## El aspecto

Superficies blancas apoyadas sobre un gris muy claro, esquinas amplias, sombras
en dos capas —una cerca para apoyar, otra lejos y muy abierta para separar del
fondo— y un solo azul, el del sistema, para todo lo accionable. La tipografía es
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
lo que guardó el último. Si el puerto ya está tomado por otra copia de Visual App,
la segunda no arranca: trae al frente la ventana que ya estaba.

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
no abra el explorador de archivos es un incordio; que se apague Visual App con una
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
- **La contraseña de acceso**: quien abre el programa es quien está sentado en la
  computadora.

## Licencia y autoría

**Visual App** es un producto de **Visual Solution**.

<https://visual-solution.vercel.app>

Copyright © 2026 Visual Solution. Todos los derechos reservados.

Que el código esté publicado no lo vuelve libre: se publica para que quien use
el programa pueda ver qué hace con su información, y para poder distribuir las
actualizaciones. Las condiciones están en [LICENSE](LICENSE).

Los datos que carga cada negocio son de ese negocio: quedan en su computadora,
Visual Solution no los recibe ni puede verlos.
