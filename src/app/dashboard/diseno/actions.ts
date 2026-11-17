"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { MANAGERS, requireBusinessUser } from "@/lib/auth";
import { normalizeUpload } from "@/lib/images";
import { syncBusinessDesign } from "@/lib/wallet/sync";
import { getPlan } from "@/lib/plans";
import type { ActionResult } from "@/components/action-form";

const HEX = /^#[0-9a-fA-F]{6}$/;

async function saveImage(businessId: string, file: FormDataEntryValue | null, maxSide: number) {
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > 3 * 1024 * 1024) throw new Error("La imagen debe pesar menos de 3 MB");
  if (!file.type.startsWith("image/")) throw new Error("El archivo debe ser una imagen (PNG o JPG)");
  const img = await normalizeUpload(Buffer.from(await file.arrayBuffer()), maxSide);
  const media = await db.media.create({
    data: { businessId, mime: img.mime, data: new Uint8Array(img.data), width: img.width, height: img.height },
  });
  return media.id;
}

export async function saveDesignAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const bgColor = String(fd.get("bgColor"));
  const fgColor = String(fd.get("fgColor"));
  const labelColor = String(fd.get("labelColor"));
  if (![bgColor, fgColor, labelColor].every((c) => HEX.test(c))) return { error: "Colores inválidos" };
  const stampStyle = fd.get("stampStyle") === "custom" ? "custom" : "default";
  try {
    const logoId = await saveImage(user.business.id, fd.get("logo"), 800);
    const stripId = await saveImage(user.business.id, fd.get("strip"), 1200);
    const stampIconId = await saveImage(user.business.id, fd.get("stampIcon"), 300);
    const stampEmptyIconId = await saveImage(user.business.id, fd.get("stampEmptyIcon"), 300);
    if (stampStyle === "custom" && !stampIconId && !user.business.stampIconId) {
      return { error: "Para el diseño personalizado sube la imagen del sello" };
    }
    await db.business.update({
      where: { id: user.business.id },
      data: {
        name: String(fd.get("name") ?? user.business.name).trim().slice(0, 60) || user.business.name,
        phone: String(fd.get("phone") ?? "").trim() || null,
        website: String(fd.get("website") ?? "").trim() || null,
        bgColor,
        fgColor,
        labelColor,
        ...(logoId ? { logoId } : {}),
        ...(stripId ? { stripId } : {}),
        ...(fd.get("removeStrip") === "on" ? { stripId: null } : {}),
        ...(fd.get("removeLogo") === "on" ? { logoId: null } : {}),
        stampStyle,
        ...(stampIconId ? { stampIconId } : {}),
        ...(stampEmptyIconId ? { stampEmptyIconId } : {}),
        ...(fd.get("removeStampEmpty") === "on" ? { stampEmptyIconId: null } : {}),
        googleClassVersion: { increment: 1 },
      },
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  after(() => syncBusinessDesign(user.business.id));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Diseño guardado. Las tarjetas en Wallet se actualizarán automáticamente." };
}

/** Logotipo de marca blanca (solo plan Empresarial): se muestra en el panel y en la página de inscripción. */
export async function saveBrandAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  if (!getPlan(user.business.plan).whiteLabel) {
    return { error: "El logotipo de marca está disponible en el plan Empresarial." };
  }
  try {
    const brandLogoId = await saveImage(user.business.id, fd.get("brandLogo"), 800);
    const remove = fd.get("removeBrandLogo") === "on";
    if (!brandLogoId && !remove) return { error: "Selecciona una imagen" };
    await db.business.update({
      where: { id: user.business.id },
      data: { brandLogoId: remove ? null : brandLogoId },
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Logotipo de marca actualizado" };
}
