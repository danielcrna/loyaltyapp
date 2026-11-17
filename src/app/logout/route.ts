import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { config } from "@/lib/config";

export async function POST() {
  (await cookies()).delete("la_session");
  return NextResponse.redirect(`${config.appUrl}/login`, 303);
}
