// Ejecuta las automatizaciones diarias. Prográmalo una vez al día (Vercel Cron, GitHub Actions, cron-job.org…)
// con el encabezado "Authorization: Bearer $CRON_SECRET".
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { runDailyAutomations } from "@/lib/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!config.cronSecret || auth !== `Bearer ${config.cronSecret}`) return new NextResponse("No autorizado", { status: 401 });
  const report = await runDailyAutomations();
  return NextResponse.json(report);
}

export const GET = handle;
export const POST = handle;
