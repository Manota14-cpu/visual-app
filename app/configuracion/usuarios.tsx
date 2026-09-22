"use client";

import { useState } from "react";
import { Boton, Campo, Dialogo, Etiqueta, Hoja, Selector } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import { useDatos } from "@/lib/datos";
import { useSesion } from "@/lib/sesion";
import { fechaHora } from "@/lib/formato";
import type { Rol, UsuarioSesion } from "@/lib/tipos";

/**
 * Quién usa el programa.
 *
 * Mientras no hay ninguno, la aplicación se abre sin pedir nada: es como venía
 * funcionando antes de que esto existiera, y es lo que hace que actualizar no
 * deje a un negocio afuera de su propia caja. Esta tarjeta es donde se prende
 * la llave, y explica qué cambia al prenderla.
 */
export function Usuarios() {
  const avisos = useAvisos();
  const { usuario: yo, exigeIngreso, refrescar } = useSesion();
  const { datos, recargar } = useDatos<UsuarioSesion[]>(exigeIngreso ? "/usuarios" : null);

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<UsuarioSesion | null>(null);
  const [cambiandoClave, setCambiandoClave] = useState<UsuarioSesion | null>(null);

  async function apagar(u: UsuarioSesion) {
    try {
      await api.borrar(`/usuarios/${u.id}`);
      avisos.exito(`${u.nombre} ya no puede entrar.`);
      await recargar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo.");
    }
  }

  // ─────────────  Todavía sin usuarios: la invitación  ─────────────
  if (!exigeIngreso) {
    return (
      <Hoja titulo="Quién usa el programa" accion={<Etiqueta tono="aviso">Sin contraseña</Etiqueta>}>
        <div className="flex flex-col gap-4">
          <p className="text-base text-tinta-suave">
            Ahora mismo cualquiera que abra el programa ve y toca todo: los costos de la mercadería,
            cuánto se gana, los informes y la configuración.
          </p>
          <p className="text-base text-tinta-suave">
            Si creás usuarios, cada uno entra con su contraseña. El dueño ve todo; quien atiende
            cobra, hace devoluciones y carga stock, pero{" "}
            <strong className="text-tinta">no ve los costos, los márgenes ni los informes</strong>.
          </p>
          <div>
            <Boton tono="principal" icono="clientes" onClick={() => setCreando(true)}>
              Crear el primer usuario
            </Boton>
          </div>
        </div>

        {creando && (
          <FormularioUsuario
            primero
            onCerrar={() => setCreando(false)}
            onListo={async () => {
              setCreando(false);
              await refrescar();
              await recargar();
            }}
          />
        )}
      </Hoja>
    );
  }

  // ─────────────────────────  La lista  ─────────────────────────
  return (
    <Hoja
      titulo="Quién usa el programa"
      cuerpo="p-0"
      accion={
        <Boton chico icono="mas" onClick={() => setCreando(true)}>
          Agregar
        </Boton>
      }
    >
      <ul>
        {(datos ?? []).map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-3 last:border-0"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{u.nombre}</span>
                <Etiqueta tono={u.rol === "dueno" ? "dato" : "neutral"}>
                  {u.rol === "dueno" ? "dueño" : "atiende"}
                </Etiqueta>
                {!u.activo && <Etiqueta tono="alerta">apagado</Etiqueta>}
                {u.id === yo?.id && <Etiqueta tono="exito">sos vos</Etiqueta>}
              </span>
              <span className="mt-0.5 block truncate text-chico text-tinta-suave">
                {u.usuario}
                {u.ultimoIngreso
                  ? ` · entró ${fechaHora(u.ultimoIngreso)}`
                  : " · todavía no entró"}
              </span>
            </span>

            <span className="flex shrink-0 flex-wrap gap-1.5">
              <Boton chico onClick={() => setCambiandoClave(u)}>
                Contraseña
              </Boton>
              {u.id !== yo?.id && (
                <>
                  <Boton chico icono="editar" onClick={() => setEditando(u)}>
                    Editar
                  </Boton>
                  {u.activo && (
                    <Boton chico tono="peligro" onClick={() => void apagar(u)}>
                      Apagar
                    </Boton>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {creando && (
        <FormularioUsuario
          onCerrar={() => setCreando(false)}
          onListo={async () => {
            setCreando(false);
            await recargar();
          }}
        />
      )}

      {editando && (
        <FormularioUsuario
          usuario={editando}
          onCerrar={() => setEditando(null)}
          onListo={async () => {
            setEditando(null);
            await recargar();
          }}
        />
      )}

      {cambiandoClave && (
        <CambiarClave
          usuario={cambiandoClave}
          // Cambiar la propia pide la actual: que la computadora del mostrador
          // haya quedado abierta no puede alcanzar para quedarse con la cuenta.
          propia={cambiandoClave.id === yo?.id}
          onCerrar={() => setCambiandoClave(null)}
        />
      )}
    </Hoja>
  );
}

/** Alta y edición. El mismo formulario, porque los campos son los mismos. */
function FormularioUsuario({
  usuario,
  primero,
  onCerrar,
  onListo,
}: {
  usuario?: UsuarioSesion;
  primero?: boolean;
  onCerrar: () => void;
  onListo: () => Promise<void>;
}) {
  const avisos = useAvisos();
  const editando = usuario !== undefined;

  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [nombreUsuario, setNombreUsuario] = useState(usuario?.usuario ?? "");
  const [clave, setClave] = useState("");
  const [rol, setRol] = useState<Rol>(usuario?.rol ?? "empleado");
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      if (editando) {
        await api.put(`/usuarios/${usuario.id}`, { nombre, rol, activo });
      } else {
        await api.post(primero ? "/usuarios/primero" : "/usuarios", {
          nombre,
          usuario: nombreUsuario,
          clave,
          rol: primero ? "dueno" : rol,
        });
      }
      avisos.exito(editando ? "Guardado." : `${nombre} ya puede entrar.`);
      await onListo();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto
      titulo={editando ? `Editar a ${usuario.nombre}` : primero ? "Primer usuario" : "Usuario nuevo"}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            tono="principal"
            onClick={() => void guardar()}
            disabled={guardando || !nombre || (!editando && (!nombreUsuario || !clave))}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {primero && (
          <p className="text-base text-tinta-suave">
            Queda como dueño: ve y toca todo. Desde acá vas a poder dar de alta a quien atiende.
          </p>
        )}

        <Campo etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />

        {!editando && (
          <>
            <Campo
              etiqueta="Usuario"
              value={nombreUsuario}
              onChange={(e) => setNombreUsuario(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              ayuda="Con esto entra. Sin espacios ni acentos."
            />
            <Campo
              etiqueta="Contraseña"
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="new-password"
              ayuda="Se la vas a tener que decir. Después puede cambiarla."
            />
          </>
        )}

        {!primero && (
          <Selector
            etiqueta="Qué puede hacer"
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
            ayuda={
              rol === "dueno"
                ? "Ve y toca todo, incluidos costos, informes y esta pantalla."
                : "Cobra, hace devoluciones y carga stock. No ve costos, márgenes ni informes."
            }
          >
            <option value="empleado">Atiende el mostrador</option>
            <option value="dueno">Dueño</option>
          </Selector>
        )}

        {editando && (
          <label className="flex items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="h-4 w-4"
            />
            Puede entrar
          </label>
        )}
      </div>
    </Dialogo>
  );
}

/** Cambiar una contraseña. La propia pide la actual; la de otro, no. */
function CambiarClave({
  usuario,
  propia,
  onCerrar,
}: {
  usuario: UsuarioSesion;
  propia: boolean;
  onCerrar: () => void;
}) {
  const avisos = useAvisos();
  const { salir } = useSesion();
  const [anterior, setAnterior] = useState("");
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (clave !== repetida) {
      avisos.error("Las dos contraseñas no coinciden.");
      return;
    }

    setGuardando(true);
    try {
      await api.post(`/usuarios/${usuario.id}/clave`, { anterior, clave });

      if (propia) {
        // Cambiar la propia cierra todas sus sesiones, incluida esta. Hay que
        // volver a entrar, y decirlo es mejor que dejar que la pantalla
        // empiece a fallar sola.
        avisos.exito("Contraseña cambiada. Entrá de nuevo.");
        await salir();
        return;
      }

      avisos.exito(`${usuario.nombre} ya puede entrar con la nueva.`);
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo cambiar.");
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto
      titulo={propia ? "Cambiar mi contraseña" : `Contraseña de ${usuario.nombre}`}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            tono="principal"
            onClick={() => void guardar()}
            disabled={guardando || !clave || !repetida || (propia && !anterior)}
          >
            {guardando ? "Guardando…" : "Cambiar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {propia ? (
          <Campo
            etiqueta="Contraseña actual"
            type="password"
            value={anterior}
            onChange={(e) => setAnterior(e.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        ) : (
          <p className="text-base text-tinta-suave">
            Le ponés una nueva y se la decís. Cuando entre, puede cambiarla por una que solo sepa
            ella.
          </p>
        )}

        <Campo
          etiqueta="Contraseña nueva"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          autoComplete="new-password"
          autoFocus={!propia}
        />
        <Campo
          etiqueta="Repetila"
          type="password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          autoComplete="new-password"
        />
      </div>
    </Dialogo>
  );
}
