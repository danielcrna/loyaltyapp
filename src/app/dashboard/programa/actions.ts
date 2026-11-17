"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { MANAGERS, requireBusinessUser } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/format";
import { syncBusinessDesign } from "@/lib/wallet/sync";
import type { ActionResult } from "@/components/action-form";

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);

const ProgramSchema = z.object({
  programType: z.enum(["POINTS", "CASHBACK", "STAMPS"]),
  programName: z.string().trim().min(2).max(40),
  pointsPerCurrency: num(0, 1000),
  cashbackPercent: num(0, 100),
  stampsRequired: z.coerce.number().int().min(1).max(20),
  stampReward: z.string().trim().max(60),
  stampMinPurchase: z.string().optional(),
  welcomeBonus: z.string().optional(),
  minRedeemCashback: z.string().optional(),
  programTerms: z.string().max(1000).default(""),
  winbackDays: z.coerce.number().int().min(0).max(365),
  winbackMessage: z.string().trim().max(200),
  birthdayMessage: z.string().trim().max(200),
});

export async function saveProgramAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const parsed = ProgramSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: `Revisa el campo "${parsed.error.issues[0].path.join(".")}": ${parsed.error.issues[0].message}` };
  const d = parsed.data;
  const welcomeRaw = d.welcomeBonus ?? "0";
  // Reglas del programa de sellos: 1 regla (solo recompensa final) o 2 reglas (nivel intermedio + final)
  let stampTiers: { stamps: number; reward: string }[] = [];
  if (fd.get("stampRuleCount") === "2") {
    const tierStamps = Math.floor(Number(fd.get("tierStamps")));
    const tierReward = String(fd.get("tierReward") ?? "").trim().slice(0, 60);
    if (!tierReward) return { error: "Escribe la recompensa del primer nivel" };
    if (!(tierStamps >= 1 && tierStamps < d.stampsRequired))
      return { error: `Los sellos del primer nivel deben ser entre 1 y ${d.stampsRequired - 1} (menos que el total de la tarjeta)` };
    stampTiers = [{ stamps: tierStamps, reward: tierReward }];
  }
  await db.business.update({
    where: { id: user.business.id },
    data: {
      programType: d.programType,
      programName: d.programName,
      pointsPerCurrency: d.pointsPerCurrency,
      cashbackPercent: d.cashbackPercent,
      stampsRequired: d.stampsRequired,
      stampReward: d.stampReward || "Una recompensa",
      stampMinPurchase: parseMoneyToCents(d.stampMinPurchase),
      stampTiers,
      // En monedero el bono de bienvenida es dinero; en puntos/sellos, una cantidad entera
      welcomeBonus: d.programType === "CASHBACK" ? parseMoneyToCents(welcomeRaw) : Math.max(0, Math.floor(Number(welcomeRaw) || 0)),
      minRedeemCashback: parseMoneyToCents(d.minRedeemCashback),
      programTerms: d.programTerms,
      winbackDays: d.winbackDays,
      winbackMessage: d.winbackMessage,
      birthdayMessage: d.birthdayMessage,
      askEmail: fd.get("askEmail") === "on",
      askPhone: fd.get("askPhone") === "on",
      askBirthday: fd.get("askBirthday") === "on",
      googleClassVersion: { increment: 1 },
    },
  });
  after(() => syncBusinessDesign(user.business.id));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Programa guardado. Las tarjetas de tus clientes se actualizarán en unos momentos." };
}

export async function addRewardAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireBusinessUser(MANAGERS);
  const name = String(fd.get("name") ?? "").trim();
  const pointsCost = Math.floor(Number(fd.get("pointsCost")));
  if (!name || !(pointsCost > 0)) return { error: "Escribe el nombre y el costo en puntos" };
  await db.reward.create({
    data: { businessId: user.business.id, name, pointsCost, description: String(fd.get("description") ?? "") },
  });
  revalidatePath("/dashboard/programa");
  return { ok: true, message: "Recompensa agregada" };
}

export async function toggleRewardAction(fd: FormData) {
  const user = await requireBusinessUser(MANAGERS);
  const id = String(fd.get("id"));
  const reward = await db.reward.findFirst({ where: { id, businessId: user.business.id } });
  if (reward) await db.reward.update({ where: { id }, data: { active: !reward.active } });
  revalidatePath("/dashboard/programa");
}
