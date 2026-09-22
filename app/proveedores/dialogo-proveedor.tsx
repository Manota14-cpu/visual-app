"use client";

import { useState } from "react";
import { Area, Boton, Campo, Dialogo } from "@/components/ui";
import { useAvisos } from "@/components/avisos";
import { api, ErrorApi } from "@/lib/api";
import type { Proveedor } from "@/lib/tipos";

/** Alta y edición de un proveedor. Solo el nombre es obligatorio. */
export function DialogoProveedor({
  proveedor,
  onCerrar,
  onGuardado,
}: {
  proveedor: Proveedor | null;
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}) {
  const avisos = useAvisos();

  const [nombre, setNombre] = useState(proveedor?.nombre ?? "");
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? "");
  const [email, setEmail] = useState(proveedor?.email ?? "");
  const [direccion, setDireccion] = useState(proveedor?.direccion ?? "");
  const [cuit, setCuit] = useState(proveedor?.cuit ?? "");
  const [notas, setNotas] = useState(proveedor?.notas ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      const cuerpo = { nombre, telefono, email, direccion, cuit, notas };
      if (proveedor) await api.put(`/proveedores/${proveedor.id}`, cuerpo);
      else await api.post("/proveedores", cuerpo);

      avisos.exito(proveedor ? "Guardado." : `${nombre} quedó cargado.`);
      await onGuardado();
    } catch (e) {
      avisos.error(e instanceof ErrorApi ? e.message : "No se pudo guardar.");
      setGuardando(false);
    }
  }

  return (
    <Dialogo
      abierto
      titulo={proveedor ? `Editar ${proveedor.nombre}` : "Proveedor nuevo"}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton tono="principal" onClick={() => void guardar()} disabled={guardando || !nombre}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <span className="sm:col-span-2">
          <Campo
            etiqueta="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
        </span>
        <Campo etiqueta="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <Campo etiqueta="CUIT" value={cuit} onChange={(e) => setCuit(e.target.value)} />
        <Campo
          etiqueta="Correo"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Campo
          etiqueta="Dirección"
          value={direccion}
          onChange={(e) => setDireccion(e.target.value)}
        />
        <span className="sm:col-span-2">
          <Area
            etiqueta="Notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            ayuda="Días que reparte, condiciones de pago, con quién hablar."
          />
        </span>
      </div>
    </Dialogo>
  );
}
