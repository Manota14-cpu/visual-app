"use client";

import { useState } from "react";
import { Area, Boton, Campo, Dialogo } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import type { Cliente } from "@/lib/tipos";

interface Formulario {
  nombre: string;
  telefono: string;
  email: string;
  ciudad: string;
  direccion: string;
  dniCuit: string;
  razonSocial: string;
  notas: string;
}

const vacio: Formulario = {
  nombre: "",
  telefono: "",
  email: "",
  ciudad: "",
  direccion: "",
  dniCuit: "",
  razonSocial: "",
  notas: "",
};

/**
 * Alta y edición de un cliente.
 *
 * El único campo obligatorio es el nombre: la mitad de la agenda de un negocio
 * de mostrador es "Rotisería La Esquina" y un teléfono, y pedir más hace que
 * nadie la cargue.
 */
export function DialogoCliente({
  abierto,
  cliente,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  cliente: Cliente | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const avisos = useAvisos();
  // El diálogo se monta recién al abrirse, así que el formulario se llena una
  // sola vez y nada lo pisa mientras se escribe.
  const [datos, setDatos] = useState<Formulario>(() =>
    cliente
      ? {
          nombre: cliente.nombre,
          telefono: cliente.telefono ?? "",
          email: cliente.email ?? "",
          ciudad: cliente.ciudad ?? "",
          direccion: cliente.direccion ?? "",
          dniCuit: cliente.dniCuit ?? "",
          razonSocial: cliente.razonSocial ?? "",
          notas: cliente.notas ?? "",
        }
      : vacio
  );
  const [guardando, setGuardando] = useState(false);

  const campo = (clave: keyof Formulario) => ({
    value: datos[clave],
    onChange: (e: { target: { value: string } }) =>
      setDatos((previo) => ({ ...previo, [clave]: e.target.value })),
  });

  async function guardar() {
    if (!datos.nombre.trim()) {
      avisos.error("Escribí el nombre del cliente.");
      return;
    }

    setGuardando(true);
    try {
      if (cliente) await api.put(`/clientes/${cliente.id}`, datos);
      else await api.post("/clientes", datos);

      avisos.exito(cliente ? "Cliente actualizado." : "Cliente agregado.");
      onGuardado();
      onCerrar();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={cliente ? "Editar cliente" : "Cliente nuevo"}
      descripcion={cliente ? cliente.nombre : "Con el nombre alcanza; el resto se completa cuando haga falta."}
      pie={
        <>
          <Boton onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton tono="principal" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo etiqueta="Nombre" placeholder="Rotisería La Esquina" autoFocus {...campo("nombre")} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Teléfono"
            inputMode="tel"
            placeholder="3492 30-1333"
            ayuda="Si ya está en otra ficha, se avisa."
            {...campo("telefono")}
          />
          <Campo etiqueta="Correo" inputMode="email" placeholder="opcional" {...campo("email")} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Ciudad" placeholder="Rafaela" {...campo("ciudad")} />
          <Campo etiqueta="Dirección" placeholder="Av. Mitre 1240" {...campo("direccion")} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Razón social" placeholder="Para la factura" {...campo("razonSocial")} />
          <Campo etiqueta="DNI o CUIT" inputMode="numeric" placeholder="30-12345678-9" {...campo("dniCuit")} />
        </div>

        <Area etiqueta="Notas" placeholder="Cómo compra, qué se le suele llevar…" {...campo("notas")} />
      </div>
    </Dialogo>
  );
}
