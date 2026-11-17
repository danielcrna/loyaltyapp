import "server-only";
import http2 from "node:http2";
import { config } from "../config";
import { db } from "../db";

/**
 * Envío de notificaciones APNs para actualizar pases de Apple Wallet.
 * Para pases se usa el MISMO certificado del Pass Type ID (autenticación por certificado),
 * el topic es el passTypeIdentifier y el payload va vacío: el iPhone consulta el web service
 * y descarga la nueva versión del pase. Si algún campo con changeMessage cambió, iOS muestra la notificación.
 */

type PushResult = { token: string; status: number; reason?: string };

function connect(): http2.ClientHttp2Session {
  const { apple } = config;
  return http2.connect(`https://${apple.apnsHost}:443`, {
    cert: apple.signerCert(),
    key: apple.signerKey(),
    passphrase: apple.signerKeyPassphrase,
  });
}

function pushOne(session: http2.ClientHttp2Session, token: string): Promise<PushResult> {
  return new Promise((resolve) => {
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      // Para pases de Wallet basta el topic; no se envía apns-push-type (como en la guía de Wallet).
      "apns-topic": config.apple.passTypeId!,
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = body ? JSON.parse(body).reason : undefined;
      } catch {
        /* ignore */
      }
      resolve({ token, status, reason });
    });
    req.on("error", (err) => resolve({ token, status: 0, reason: err.message }));
    req.setTimeout(10_000, () => {
      req.close();
      resolve({ token, status: 0, reason: "timeout" });
    });
    req.end("{}");
  });
}

/** Envía push a todos los dispositivos registrados para los seriales dados. Devuelve cuántos se enviaron. */
export async function pushPassUpdates(serials: string[]): Promise<number> {
  if (!config.apple.enabled || serials.length === 0) return 0;
  const regs = await db.appleRegistration.findMany({
    where: { serialNumber: { in: serials }, passTypeIdentifier: config.apple.passTypeId! },
    include: { device: true },
  });
  const tokens = [...new Set(regs.map((r) => r.device.pushToken))];
  if (tokens.length === 0) return 0;

  const session = connect();
  session.on("error", (e) => console.error("[apns] session error", e.message));
  let sent = 0;
  try {
    // Envío en lotes para no saturar la conexión HTTP/2
    for (let i = 0; i < tokens.length; i += 50) {
      const results = await Promise.all(tokens.slice(i, i + 50).map((t) => pushOne(session, t)));
      for (const r of results) {
        if (r.status === 200) sent++;
        else if (r.status === 410 || r.reason === "BadDeviceToken" || r.reason === "Unregistered") {
          // El dispositivo ya no existe: limpiar registros
          await db.appleDevice.deleteMany({ where: { pushToken: r.token } });
        } else {
          console.warn("[apns] push failed", r.status, r.reason);
        }
      }
    }
  } finally {
    session.close();
  }
  return sent;
}
