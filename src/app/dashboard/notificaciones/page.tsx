import { requireBusinessUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { config } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { sendBroadcastAction } from "./actions";

export const metadata = { title: "Notificaciones" };

export default async function NotificationsPage() {
  const { business: b } = await requireBusinessUser();
  const campaigns = await db.campaign.findMany({ where: { businessId: b.id }, orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <>
      <PageHeader title="Notificaciones" description="Envía mensajes que llegan como notificación a la tarjeta guardada en Apple Wallet o Google Wallet." />
      {(!config.apple.enabled || !config.google.enabled) && (
        <div className="mb-6">
          <Notice>
            {!config.apple.enabled && "Apple Wallet aún no está configurado en la plataforma. "}
            {!config.google.enabled && "Google Wallet aún no está configurado en la plataforma. "}
            Los mensajes se guardarán y se verán en la tarjeta web del cliente.
          </Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <Card title="Nuevo mensaje">
          <ActionForm action={sendBroadcastAction} resetOnSuccess confirm="¿Enviar esta notificación?">
            <Field label="Destinatarios">
              <Select name="segment" defaultValue="all">
                <option value="all">Todos los clientes</option>
                <option value="inactive30">Sin visita en los últimos 30 días</option>
                <option value="rewardReady">Con recompensa o saldo por usar</option>
              </Select>
            </Field>
            <Field label="Título">
              <Input name="title" maxLength={60} placeholder="¡Hoy 2x1 en frappés!" required />
            </Field>
            <Field label="Mensaje" hint="Breve y directo. Google Wallet permite máx. 3 notificaciones por tarjeta al día.">
              <Textarea name="message" maxLength={240} placeholder="Solo hoy de 4 a 7 pm. Muestra tu tarjeta en caja." required />
            </Field>
            <SubmitButton>Enviar notificación</SubmitButton>
          </ActionForm>
          <div className="mt-6 space-y-2 text-xs text-stone-500">
            <p>
              <strong>iPhone:</strong> el mensaje se escribe en la sección “Novedades” del pase y iOS lo muestra como notificación de Wallet.
            </p>
            <p>
              <strong>Android:</strong> se envía como mensaje de Google Wallet con notificación.
            </p>
            <p>Los avisos por cercanía se configuran en Sucursales y los de cumpleaños/inactividad en Programa.</p>
          </div>
        </Card>
        <Card title="Historial">
          {campaigns.length === 0 ? (
            <p className="text-sm text-stone-500">Aún no has enviado notificaciones.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {campaigns.map((c) => (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <strong>{c.title}</strong>
                    <span className="shrink-0 text-xs text-stone-500">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="text-stone-600">{c.message}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {c.recipients} destinatarios · Apple {c.appleSent} · Google {c.googleSent}
                    {c.kind === "promotion" && " · cupón"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
