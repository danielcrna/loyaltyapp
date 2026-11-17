// Configuración central leída de variables de entorno.
// Todas las integraciones externas son opcionales: si faltan credenciales, la función se desactiva
// y la plataforma sigue funcionando (tarjeta web + QR).

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : undefined;
}

/** Decodifica un valor PEM que puede venir en base64 o con "\n" escapados. */
export function readPem(name: string): string | undefined {
  const raw = env(name);
  if (!raw) return undefined;
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  return Buffer.from(raw, "base64").toString("utf8");
}

export const config = {
  appName: env("NEXT_PUBLIC_APP_NAME") ?? "Lealt.io",
  appUrl: (env("APP_URL") ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: env("SESSION_SECRET") ?? "dev-secret-change-me-dev-secret-change-me",
  cronSecret: env("CRON_SECRET"),
  trialDays: Number(env("TRIAL_DAYS") ?? 14),
  superAdminEmails: (env("SUPERADMIN_EMAILS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  apple: {
    passTypeId: env("APPLE_PASS_TYPE_ID"),
    teamId: env("APPLE_TEAM_ID"),
    signerCert: () => readPem("APPLE_PASS_CERT"),
    signerKey: () => readPem("APPLE_PASS_KEY"),
    signerKeyPassphrase: env("APPLE_PASS_KEY_PASSPHRASE"),
    wwdr: () => readPem("APPLE_WWDR_CERT"),
    apnsHost: env("APNS_HOST") ?? "api.push.apple.com",
    get enabled() {
      return Boolean(
        this.passTypeId && this.teamId && env("APPLE_PASS_CERT") && env("APPLE_PASS_KEY") && env("APPLE_WWDR_CERT"),
      );
    },
  },

  google: {
    issuerId: env("GOOGLE_WALLET_ISSUER_ID"),
    serviceAccountEmail: env("GOOGLE_SA_EMAIL"),
    privateKey: () => readPem("GOOGLE_SA_PRIVATE_KEY"),
    get enabled() {
      return Boolean(this.issuerId && this.serviceAccountEmail && env("GOOGLE_SA_PRIVATE_KEY"));
    },
  },

  stripe: {
    secretKey: env("STRIPE_SECRET_KEY"),
    webhookSecret: env("STRIPE_WEBHOOK_SECRET"),
    get enabled() {
      return Boolean(this.secretKey);
    },
  },
};

/** URL pública HTTPS requerida por Apple (webServiceURL) y Google (imágenes). */
export function publicUrl(path: string) {
  return `${config.appUrl}${path.startsWith("/") ? path : `/${path}`}`;
}
