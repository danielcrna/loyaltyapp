"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-lg bg-stone-900 px-5 py-2 font-semibold text-white print:hidden">
      Imprimir
    </button>
  );
}
