import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-titulo text-titulo">Esta pantalla no existe</p>
      <p className="max-w-sm text-base text-tinta-suave">
        Puede que el enlace esté viejo o que la dirección tenga un error de tipeo.
      </p>
      <Link
        href="/panel"
        className="mt-2 inline-flex h-9 items-center rounded border border-transparent bg-acento px-3.5 text-base text-white shadow-acento transition-colors hover:bg-acento-fuerte"
      >
        Ir al panel
      </Link>
    </main>
  );
}
