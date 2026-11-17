"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { randomCode } from "@/lib/codes";
import type { ActionResult } from "@/components/action-form";

const SignupSchema = z.object({
  businessName: z.string().trim().min(2, "Escribe el nombre de tu negocio").max(80),
  category: z.enum(["cafeteria", "restaurante", "panaderia", "bar", "heladeria", "otro"]).default("cafeteria"),
  name: z.string().trim().min(2, "Escribe tu nombre").max(80),
  email: z.email("Correo inválido").transform((s) => s.toLowerCase().trim()),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  terms: z.literal("on", { error: "Debes aceptar los términos" }),
});

export async function signupAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;

  if (await db.user.findUnique({ where: { email: data.email } })) {
    return { error: "Ya existe una cuenta con ese correo. Inicia sesión." };
  }

  let slug = slugify(data.businessName) || "negocio";
  if (await db.business.findUnique({ where: { slug } })) slug = `${slug}-${randomCode(4).toLowerCase()}`;

  const user = await db.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: data.businessName,
        slug,
        category: data.category,
        email: data.email,
        programName: "Tarjeta de lealtad",
        stampReward: data.category === "restaurante" ? "Un postre gratis" : "Una bebida gratis",
        trialEndsAt: new Date(Date.now() + config.trialDays * 864e5),
        subscriptionStatus: "TRIALING",
      },
    });
    return tx.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: await hashPassword(data.password),
        role: "OWNER",
        businessId: business.id,
        isSuperAdmin: config.superAdminEmails.includes(data.email),
      },
    });
  });

  await createSession(user.id);
  redirect("/dashboard?bienvenida=1");
}

export async function loginAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") ?? "").toLowerCase().trim();
  const password = String(fd.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Correo o contraseña incorrectos" };
  }
  const isSuperAdmin = user.isSuperAdmin || config.superAdminEmails.includes(email);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), isSuperAdmin } });
  await createSession(user.id);
  if (!user.businessId) redirect(isSuperAdmin ? "/admin" : "/");
  redirect(user.role === "STAFF" ? "/escaner" : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
