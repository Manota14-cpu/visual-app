"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Boton, Dialogo } from "@/components/ui";
import { Icono } from "@/components/iconos";

/**
 * Leer códigos de barras con la cámara.
 *
 * Hay dos formas, y cuál se ofrece depende de dónde se abre el programa:
 *
 *   - **En vivo**, en la computadora: se apunta la cámara al código y el
 *     producto entra solo, sin tocar nada, y se puede seguir con el siguiente.
 *     El navegador solo presta la cámara en vivo a páginas seguras, y la
 *     ventana de Visual App lo es (habla con la propia computadora).
 *   - **Con una foto**, en el celular: entrando por el wifi del local la
 *     conexión no es segura para el navegador, que ahí no presta la cámara en
 *     vivo. Pero sí deja sacar una foto, y el código se lee de la foto.
 *
 * Quien lee los códigos es ZXing, que viaja adentro del programa: funciona
 * sin internet. Se carga recién al abrir la cámara, para no hacer más pesada
 * la caja de todos los días.
 */

/** Lo que lee: los códigos de los productos, los de las etiquetas propias y QR. */
async function lector() {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);

  const pistas = new Map();
  pistas.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.QR_CODE,
  ]);
  pistas.set(DecodeHintType.TRY_HARDER, true);

  return new BrowserMultiFormatReader(pistas, {
    delayBetweenScanAttempts: 120,
    // Entre lecturas buenas no se espera: hace falta saber que el código sigue
    // en cuadro para no volver a sumarlo (ver FUERA_DE_CUADRO_MS).
    delayBetweenScanSuccess: 120,
  });
}

/**
 * Cuánto tiene que dejar de verse un código para que volver a verlo cuente
 * como otro producto.
 *
 * Un producto quieto frente a la cámara se lee diez veces por segundo. Si se
 * contara cada lectura —o una cada tanto— dejarlo apoyado un momento lo
 * cobraría varias veces. Así, el mismo código solo vuelve a entrar si salió de
 * cuadro y volvió: que es lo que pasa al pasar un segundo paquete igual.
 */
const FUERA_DE_CUADRO_MS = 900;

export function BotonCamara({
  onCodigo,
  titulo = "Leer con la cámara",
}: {
  onCodigo: (codigo: string) => void;
  titulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Boton
        icono="camara"
        onClick={() => setAbierto(true)}
        aria-label={titulo}
        title={titulo}
        className="shrink-0 px-2.5"
      />
      {abierto && (
        <DialogoCamara titulo={titulo} onCodigo={onCodigo} onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}

function DialogoCamara({
  titulo,
  onCodigo,
  onCerrar,
}: {
  titulo: string;
  onCodigo: (codigo: string) => void;
  onCerrar: () => void;
}) {
  // En vivo solo donde el navegador presta la cámara. Se decide una vez, al
  // abrir: no cambia mientras la ventana está abierta.
  const [enVivo] = useState(
    () =>
      typeof window !== "undefined" &&
      window.isSecureContext &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
  );

  const [leidos, setLeidos] = useState<string[]>([]);
  const alLeer = useRef(onCodigo);
  useEffect(() => {
    alLeer.current = onCodigo;
  });

  const anotar = (codigo: string) => {
    alLeer.current(codigo);
    setLeidos((previos) => [codigo, ...previos].slice(0, 5));
  };

  return (
    <Dialogo
      abierto
      onCerrar={onCerrar}
      titulo={titulo}
      descripcion={
        enVivo
          ? "Apuntá la cámara al código de barras. Cada producto entra solo: seguí con el siguiente."
          : "Sacale una foto al código de barras, de cerca y derecha."
      }
      ancho="max-w-lg"
      pie={<Boton onClick={onCerrar}>Listo</Boton>}
    >
      <div className="flex flex-col gap-4">
        {enVivo ? <EnVivo onCodigo={anotar} /> : null}
        <DesdeFoto onCodigo={anotar} secundario={enVivo} />

        {leidos.length > 0 && (
          <div>
            <p className="etiqueta-campo mb-1.5">Leídos</p>
            <ul className="flex flex-col gap-1 text-chico">
              {leidos.map((codigo, i) => (
                <li key={`${codigo}-${i}`} className="flex items-center gap-2 text-tinta-media">
                  <Icono nombre="listo" tamano={14} className="text-exito-texto" />
                  <span className="cifra">{codigo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialogo>
  );
}

/** La cámara en vivo, leyendo sin parar hasta que se cierra. */
function EnVivo({ onCodigo }: { onCodigo: (codigo: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [arrancando, setArrancando] = useState(true);
  const [destello, setDestello] = useState(false);
  const alLeer = useRef(onCodigo);
  useEffect(() => {
    alLeer.current = onCodigo;
  });

  useEffect(() => {
    let controles: IScannerControls | null = null;
    let cancelado = false;
    // El último código leído y la última vez que se lo vio en cuadro.
    let ultimo = { codigo: "", visto: 0 };

    void (async () => {
      try {
        const leer = await lector();
        if (cancelado || !video.current) return;

        controles = await leer.decodeFromConstraints(
          // La de atrás en un teléfono o una tableta; en una computadora hay
          // una sola y se toma esa.
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video.current,
          (resultado) => {
            if (!resultado) return;
            const codigo = resultado.getText().trim();
            const ahora = Date.now();
            if (!codigo) return;
            const sigueEnCuadro = codigo === ultimo.codigo && ahora - ultimo.visto < FUERA_DE_CUADRO_MS;
            ultimo = { codigo, visto: ahora };
            if (sigueEnCuadro) return;
            alLeer.current(codigo);
            setDestello(true);
            setTimeout(() => setDestello(false), 250);
          }
        );
        if (cancelado) controles.stop();
        else setArrancando(false);
      } catch (error) {
        if (cancelado) return;
        setArrancando(false);
        setProblema(explicar(error));
      }
    })();

    return () => {
      cancelado = true;
      controles?.stop();
    };
  }, []);

  if (problema) {
    return (
      <div className="rounded-md border border-alerta-linea bg-alerta-fondo px-3 py-2.5 text-base text-alerta-texto">
        {problema}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-md bg-black">
      <video ref={video} muted playsInline className="block aspect-[4/3] w-full object-cover" />
      {/* La guía: dónde poner el código. Las barras se leen mejor derechas y
          ocupando el ancho, no de lejos. */}
      <div
        className={
          "pointer-events-none absolute inset-x-[12%] top-1/2 h-[34%] -translate-y-1/2 rounded-md border-2 transition-colors duration-200 " +
          (destello ? "border-exito-texto bg-exito-texto/20" : "border-white/80")
        }
      />
      {arrancando && (
        <p className="absolute inset-0 flex items-center justify-center text-base text-white/80">
          Abriendo la cámara…
        </p>
      )}
    </div>
  );
}

/**
 * Leer el código de una foto.
 *
 * En el celular es la única forma (ver arriba). `capture` abre directo la
 * cámara de atrás en vez de la galería. En la computadora queda como segunda
 * opción, para una foto que ya se tiene.
 */
function DesdeFoto({ onCodigo, secundario }: { onCodigo: (codigo: string) => void; secundario: boolean }) {
  const archivo = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  async function leerFoto(foto: File) {
    setLeyendo(true);
    setProblema(null);
    try {
      const codigo = await codigoDeLaFoto(foto);
      if (codigo) onCodigo(codigo);
      else setProblema("No se encontró ningún código en la foto. Probá más de cerca, derecha y con buena luz.");
    } finally {
      setLeyendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={archivo}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const foto = e.target.files?.[0];
          if (foto) void leerFoto(foto);
        }}
      />
      <div>
        <Boton
          tono={secundario ? "fantasma" : "principal"}
          icono="camara"
          onClick={() => archivo.current?.click()}
          disabled={leyendo}
        >
          {leyendo ? "Leyendo la foto…" : secundario ? "O leer el código de una foto" : "Sacar foto del código"}
        </Boton>
      </div>
      {problema && <p className="text-chico text-alerta-texto">{problema}</p>}
    </div>
  );
}

/**
 * El código que hay en una foto, o `null`.
 *
 * La foto de un teléfono tiene doce millones de puntos y un código ocupa una
 * franja chica: se achica a un tamaño razonable antes de leer (leerla entera
 * tarda segundos y no mejora nada). Y si no aparece, se prueba girada: es
 * común sacarla con el teléfono de costado.
 */
async function codigoDeLaFoto(foto: File): Promise<string | null> {
  const leer = await lector();
  const url = URL.createObjectURL(foto);
  try {
    const imagen = await new Promise<HTMLImageElement>((listo, fallo) => {
      const i = new Image();
      i.onload = () => listo(i);
      i.onerror = () => fallo(new Error("No se pudo abrir la foto."));
      i.src = url;
    });

    for (const [lado, giro] of [
      [1600, 0],
      [1600, 90],
      [900, 0],
    ] as const) {
      const lienzo = dibujar(imagen, lado, giro);
      try {
        return leer.decodeFromCanvas(lienzo).getText().trim();
      } catch {
        // Con otro tamaño o girada.
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dibujar(imagen: HTMLImageElement, ladoMaximo: number, giro: 0 | 90): HTMLCanvasElement {
  const escala = Math.min(1, ladoMaximo / Math.max(imagen.naturalWidth, imagen.naturalHeight));
  const ancho = Math.round(imagen.naturalWidth * escala);
  const alto = Math.round(imagen.naturalHeight * escala);

  const lienzo = document.createElement("canvas");
  lienzo.width = giro ? alto : ancho;
  lienzo.height = giro ? ancho : alto;
  const pincel = lienzo.getContext("2d")!;
  if (giro) {
    pincel.translate(alto, 0);
    pincel.rotate(Math.PI / 2);
  }
  pincel.drawImage(imagen, 0, 0, ancho, alto);
  return lienzo;
}

/** Por qué no abrió la cámara, dicho para quien está en el mostrador. */
function explicar(error: unknown): string {
  const nombre = (error as { name?: string })?.name ?? "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "No hay permiso para usar la cámara. En Windows: Configuración → Privacidad y seguridad → Cámara, y permitir el acceso a las aplicaciones de escritorio.";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") {
    return "No se encontró ninguna cámara conectada. Podés leer el código de una foto.";
  }
  if (nombre === "NotReadableError") {
    return "La cámara la está usando otro programa. Cerralo y volvé a abrir esta ventana.";
  }
  return "No se pudo abrir la cámara. Podés leer el código de una foto.";
}
