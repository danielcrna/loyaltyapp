"use client";

import { useEffect } from "react";

/** Registra el service worker para que el escáner pueda instalarse como app (PWA). */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
