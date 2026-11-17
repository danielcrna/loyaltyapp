"use client";

import { useEffect } from "react";
import { rememberCardAction } from "./actions";

/** Al abrir su tarjeta, el navegador la recuerda para reclamar cupones por QR con un toque. */
export function RememberCard({ serial }: { serial: string }) {
  useEffect(() => {
    rememberCardAction(serial).catch(() => {});
  }, [serial]);
  return null;
}
