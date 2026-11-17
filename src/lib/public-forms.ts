import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import type { Business } from "@prisma/client";
import type { EnrollInput } from "./services";

// Límite simple en memoria por IP (suficiente para una instancia; usa Redis/Upstash si escalas a varias).
const hits = new Map<string, { n: number; at: number }>();

/** true si la IP de la petición superó `max` intentos en 10 minutos para la acción indicada. */
export async function rateLimited(scope: string, max = 10) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.at > 10 * 60_000) {
    hits.set(key, { n: 1, at: now });
    return false;
  }
  h.n++;
  return h.n > max;
}

const JoinSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(80),
  phone: z.string().trim().max(20).optional(),
  email: z.union([z.literal(""), z.email("Correo inválido")]).optional(),
  birthday: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});

/** Valida el formulario público de inscripción según los campos que pide el negocio. */
export function parseJoinForm(business: Business, fd: FormData): { data: EnrollInput } | { error: string } {
  if (fd.get("website")) return { error: "Error de validación" }; // honeypot anti-bots
  const parsed = JoinSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (business.askPhone && !d.phone) return { error: "Escribe tu teléfono" };
  if (business.askEmail && !business.askPhone && !d.email) return { error: "Escribe tu correo" };
  if (fd.get("privacy") !== "on") return { error: "Debes aceptar el aviso de privacidad" };
  return {
    data: {
      name: d.name,
      phone: d.phone,
      email: d.email || null,
      birthday: d.birthday ? new Date(`${d.birthday}T00:00:00Z`) : null,
      marketingConsent: fd.get("marketing") === "on",
      source: "qr",
    },
  };
}
