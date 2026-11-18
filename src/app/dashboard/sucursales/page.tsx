import { requireBusinessUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Input, Notice, PageHeader } from "@/components/ui";
import { GeoButton } from "@/components/geo-button";
import { addLocationAction, setHideNearbyAction, updateLocationAction } from "./actions";

export const metadata = { title: "Sucursales" };

export default async function LocationsPage() {
  const { business: b } = await requireBusinessUser();
  const locations = await db.location.findMany({ where: { businessId: b.id }, orderBy: { createdAt: "asc" } });
  const plan = getPlan(b.plan);
  return (
    <>
      <PageHeader
        title="Sucursales"
        description={`Tus ubicaciones activan avisos en la pantalla de bloqueo cuando un cliente con tu tarjeta está cerca. ${locations.length}/${plan.maxLocations} en tu plan.`}
      />
      <div className="mb-6">
        <Notice tone="blue">
          <strong>¿Cómo funcionan los avisos por cercanía?</strong> En iPhone, Apple Wallet muestra tu tarjeta con el mensaje que escribas
          al estar a ~100 m de la sucursal (requiere que el cliente tenga la ubicación activada; iOS decide cuándo mostrarlo). En Android,
          Google Wallet envía su propia notificación de “pase cercano” con texto definido por Google. Máximo 10 ubicaciones por tarjeta.
        </Notice>
        <Card className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h3 className="font-semibold">
                Ocultar el aviso después de la visita {b.hideNearbyAfterVisit ? <Badge tone="green">Activado</Badge> : <Badge>Desactivado</Badge>}
              </h3>
              <p className="mt-1 text-sm text-stone-600">
                En iPhone el cliente no puede descartar el aviso de cercanía: iOS lo deja en la pantalla bloqueada mientras esté cerca. Con
                esta opción, al registrar su visita en el escáner su tarjeta (y sus cupones) se actualizan sin ubicaciones y el aviso
                desaparece; vuelve a activarse a las 5:00 a. m. del día siguiente con la tarea diaria de automatizaciones.
              </p>
            </div>
            <form action={setHideNearbyAction}>
              <input type="hidden" name="value" value={b.hideNearbyAfterVisit ? "off" : "on"} />
              <button className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold">
                {b.hideNearbyAfterVisit ? "Desactivar" : "Activar"}
              </button>
            </form>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {locations.length === 0 && <EmptyState title="Aún no tienes sucursales">Agrega la primera con el formulario.</EmptyState>}
          {locations.map((l) => (
            <Card key={l.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">
                    {l.name} {!l.active && <Badge>Inactiva</Badge>}
                  </h3>
                  <p className="text-sm text-stone-600">{l.address}</p>
                  <a
                    className="text-xs text-brand-700 underline"
                    target="_blank"
                    href={`https://www.google.com/maps/search/?api=1&query=${l.latitude},${l.longitude}`}
                  >
                    {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)} · ver en mapa
                  </a>
                </div>
                <div className="flex gap-2">
                  <form action={updateLocationAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <button name="op" value="toggle" className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold">
                      {l.active ? "Desactivar" : "Activar"}
                    </button>
                  </form>
                  <form action={updateLocationAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <button name="op" value="delete" className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
                      Eliminar
                    </button>
                  </form>
                </div>
              </div>
              <form action={updateLocationAction} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={l.id} />
                <Input name="relevantText" defaultValue={l.relevantText} maxLength={120} placeholder={`¡Estás cerca de ${b.name}! Muestra tu tarjeta y suma.`} />
                <button className="shrink-0 rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white">Guardar mensaje</button>
              </form>
            </Card>
          ))}
        </div>

        <Card title="Nueva sucursal">
          <ActionForm action={addLocationAction} resetOnSuccess>
            <Field label="Nombre">
              <Input name="name" placeholder="Sucursal Centro" required />
            </Field>
            <Field label="Dirección">
              <Input name="address" placeholder="Av. Juárez 123, Col. Centro" />
            </Field>
            <GeoButton />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud">
                <Input name="latitude" inputMode="decimal" placeholder="19.4326" required />
              </Field>
              <Field label="Longitud">
                <Input name="longitude" inputMode="decimal" placeholder="-99.1332" required />
              </Field>
            </div>
            <Field label="Mensaje al estar cerca (iPhone)" hint="Máx. 120 caracteres. Ej. ☕ Tu café #10 es gratis, ¡pasa por él!">
              <Input name="relevantText" maxLength={120} />
            </Field>
            <SubmitButton>Agregar sucursal</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
