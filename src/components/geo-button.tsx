"use client";

import { useState } from "react";

/** Rellena los campos latitude/longitude del formulario con la ubicación actual del dispositivo. */
export function GeoButton() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-stone-50"
        onClick={(e) => {
          const form = (e.currentTarget as HTMLButtonElement).form;
          if (!navigator.geolocation) return setMsg("Tu navegador no permite obtener la ubicación");
          setMsg("Obteniendo ubicación…");
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              (form?.elements.namedItem("latitude") as HTMLInputElement).value = pos.coords.latitude.toFixed(6);
              (form?.elements.namedItem("longitude") as HTMLInputElement).value = pos.coords.longitude.toFixed(6);
              setMsg(`Listo (precisión ±${Math.round(pos.coords.accuracy)} m)`);
            },
            () => setMsg("No se pudo obtener la ubicación. Cópiala desde Google Maps (clic derecho → coordenadas)."),
            { enableHighAccuracy: true, timeout: 15000 },
          );
        }}
      >
        ⌖ Usar mi ubicación actual
      </button>
      {msg && <span className="text-xs text-stone-500">{msg}</span>}
    </div>
  );
}
