"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { MANAGERS, requireBusinessUser } from "@/lib/auth";
import { getPlan } from "@/lib/plans";
import { syncBusinessDesign } from "@/lib/wallet/sync";
import type { ActionResult } from "@/components/action-form";

const LocationSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre de la sucursal").max(60),
  address: z.string().trim().max(200).default(""),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  relevantText: z.string().trim().max(120).default(""),
});

export async function addLocationAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const parsed = LocationSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Revisa nombre, latitud y longitud (usa el botón de ubicación o cópialas de Google Maps)" };
  const plan = getPlan(user.business.plan);
  const count = await db.location.count({ where: { businessId: user.business.id } });
  if (count >= plan.maxLocations) return { error: `Tu plan ${plan.name} permite ${plan.maxLocations} sucursal(es). Mejora tu plan para agregar más.` };
  await db.location.create({ data: { ...parsed.data, businessId: user.business.id } });
  await db.business.update({ where: { id: user.business.id }, data: { googleClassVersion: { increment: 1 } } });
  after(() => syncBusinessDesign(user.business.id));
  revalidatePath("/dashboard/sucursales");
  return { ok: true, message: "Sucursal agregada. Los pases se actualizarán con la nueva ubicación." };
}

export async function updateLocationAction(fd: FormData) {
  const user = await requireBusinessUser(MANAGERS);
  const id = String(fd.get("id"));
  const loc = await db.location.findFirst({ where: { id, businessId: user.business.id } });
  if (!loc) return;
  if (fd.get("op") === "delete") await db.location.delete({ where: { id } });
  else if (fd.get("op") === "toggle") await db.location.update({ where: { id }, data: { active: !loc.active } });
  else {
    const relevantText = String(fd.get("relevantText") ?? "").slice(0, 120);
    await db.location.update({ where: { id }, data: { relevantText } });
  }
  after(() => syncBusinessDesign(user.business.id));
  revalidatePath("/dashboard/sucursales");
}
