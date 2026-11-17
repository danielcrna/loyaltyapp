import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { config } from "./config";

const COOKIE = "la_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

const key = () => new TextEncoder().encode(config.sessionSecret);

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.appUrl.startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub) return null;
    return await db.user.findUnique({ where: { id: payload.sub }, include: { business: true } });
  } catch {
    return null;
  }
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Usuario que pertenece a un negocio; opcionalmente restringe roles. */
export async function requireBusinessUser(roles?: Role[]) {
  const user = await requireUser();
  if (!user.business) redirect(user.isSuperAdmin ? "/admin" : "/login");
  if (roles && !roles.includes(user.role)) redirect("/escaner");
  return user as CurrentUser & { business: NonNullable<CurrentUser["business"]> };
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/dashboard");
  return user;
}

export const MANAGERS: Role[] = ["OWNER", "MANAGER"];
