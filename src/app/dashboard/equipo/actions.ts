"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireBusinessUser } from "@/lib/auth";
import { getPlan } from "@/lib/plans";
import type { ActionResult } from "@/components/action-form";

const MemberSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre"),
  email: z.email("Correo inválido").transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  role: z.enum(["MANAGER", "STAFF"]),
});

export async function addMemberAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(["OWNER"]);
  const parsed = MemberSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const plan = getPlan(user.business.plan);
  const count = await db.user.count({ where: { businessId: user.business.id } });
  if (count >= plan.maxStaff) return { error: `Tu plan permite ${plan.maxStaff} usuarios` };
  if (await db.user.findUnique({ where: { email: parsed.data.email } })) return { error: "Ese correo ya tiene una cuenta" };
  await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
      businessId: user.business.id,
    },
  });
  revalidatePath("/dashboard/equipo");
  return { ok: true, message: "Usuario creado. Comparte el correo y la contraseña con tu colaborador." };
}

export async function removeMemberAction(fd: FormData) {
  const user = await requireBusinessUser(["OWNER"]);
  const id = String(fd.get("id"));
  if (id === user.id) return;
  await db.user.deleteMany({ where: { id, businessId: user.business.id, role: { not: "OWNER" } } });
  revalidatePath("/dashboard/equipo");
}

export async function changePasswordAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(["OWNER"]);
  const id = String(fd.get("id"));
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8) return { error: "Mínimo 8 caracteres" };
  const r = await db.user.updateMany({ where: { id, businessId: user.business.id }, data: { passwordHash: await hashPassword(pw) } });
  return r.count ? { ok: true, message: "Contraseña actualizada" } : { error: "Usuario no encontrado" };
}
