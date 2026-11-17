import { requireBusinessUser } from "@/lib/auth";
import { parseStampTiers } from "@/lib/loyalty";
import { StampRulesFields } from "./stamp-rules-fields";
import { db } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Checkbox, Field, Input, Notice, PageHeader, Select, Textarea } from "@/components/ui";
import { addRewardAction, saveProgramAction, toggleRewardAction } from "./actions";

export const metadata = { title: "Programa de lealtad" };

export default async function ProgramPage() {
  const { business: b } = await requireBusinessUser();
  const rewards = await db.reward.findMany({ where: { businessId: b.id }, orderBy: { pointsCost: "asc" } });
  const customers = await db.customer.count({ where: { businessId: b.id } });
  const money = (c: number) => (c / 100).toFixed(2);
  const tier = parseStampTiers(b.stampTiers, b.stampsRequired)[0];

  return (
    <>
      <PageHeader title="Programa de lealtad" description="Elige cómo premias a tus clientes y las reglas para ganar y canjear." />

      <ActionForm action={saveProgramAction} className="space-y-6">
        <Card title="Tipo de programa">
          {customers > 0 && (
            <div className="mb-4">
              <Notice>
                Ya tienes {customers} clientes. Si cambias el tipo de programa, sus saldos actuales se conservan pero solo se mostrará el del nuevo tipo.
              </Notice>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { v: "STAMPS", t: "Sellos / visitas", d: "Cada visita o compra suma un sello. Al completar la tarjeta gana una recompensa. Ideal para cafeterías." },
              { v: "POINTS", t: "Puntos", d: "Gana puntos por cada peso gastado y los canjea por productos de tu catálogo." },
              { v: "CASHBACK", t: "Monedero electrónico", d: "Un % de cada compra regresa como saldo que puede usar en su siguiente visita." },
            ].map((o) => (
              <label key={o.v} className="cursor-pointer rounded-xl border border-stone-200 p-4 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                <input type="radio" name="programType" value={o.v} defaultChecked={b.programType === o.v} className="accent-brand-600" />
                <span className="ml-2 font-semibold">{o.t}</span>
                <p className="mt-1 text-xs text-stone-600">{o.d}</p>
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del programa" hint="Aparece en la tarjeta (máx. 40 caracteres)">
              <Input name="programName" defaultValue={b.programName} maxLength={40} required />
            </Field>
            <Field label="Bono de bienvenida" hint="Sellos, puntos o pesos (monedero) que recibe al inscribirse. 0 = sin bono">
              <Input name="welcomeBonus" defaultValue={b.programType === "CASHBACK" ? money(b.welcomeBonus) : b.welcomeBonus} inputMode="decimal" />
            </Field>
          </div>
        </Card>

        <Card title="Reglas">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-stone-500">Sellos</h3>
              <StampRulesFields
                stampsRequired={b.stampsRequired}
                stampReward={b.stampReward}
                tierStamps={tier?.stamps}
                tierReward={tier?.reward}
              />
              <Field label="Compra mínima para sello ($)" hint="0 = un sello por visita">
                <Input name="stampMinPurchase" defaultValue={money(b.stampMinPurchase)} inputMode="decimal" />
              </Field>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-stone-500">Puntos</h3>
              <Field label="Puntos por cada $1 gastado" hint="Ej. 0.1 = 1 punto por cada $10">
                <Input name="pointsPerCurrency" type="number" step="0.01" min={0} defaultValue={b.pointsPerCurrency} />
              </Field>
              <p className="text-xs text-stone-500">Las recompensas canjeables se configuran abajo en el catálogo.</p>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-stone-500">Monedero</h3>
              <Field label="% de cashback">
                <Input name="cashbackPercent" type="number" step="0.1" min={0} max={100} defaultValue={b.cashbackPercent} />
              </Field>
              <Field label="Saldo mínimo para usar ($)">
                <Input name="minRedeemCashback" defaultValue={money(b.minRedeemCashback)} inputMode="decimal" />
              </Field>
            </div>
          </div>
          <Field label="Términos y condiciones del programa" className="mt-4">
            <Textarea name="programTerms" defaultValue={b.programTerms} maxLength={1000} placeholder="Ej. Recompensas no acumulables con otras promociones. Válido en todas las sucursales." />
          </Field>
        </Card>

        <Card title="Formulario de inscripción">
          <p className="mb-3 text-sm text-stone-600">El nombre siempre se pide. Elige qué otros datos quieres guardar para contactar a tus clientes.</p>
          <div className="flex flex-wrap gap-6">
            <Checkbox name="askPhone" defaultChecked={b.askPhone} label="Teléfono / WhatsApp" />
            <Checkbox name="askEmail" defaultChecked={b.askEmail} label="Correo electrónico" />
            <Checkbox name="askBirthday" defaultChecked={b.askBirthday} label="Fecha de cumpleaños" />
          </div>
        </Card>

        <Card title="Recordatorios automáticos">
          <p className="mb-4 text-sm text-stone-600">
            Se envían como notificación a la tarjeta en Apple Wallet / Google Wallet. Puedes adjuntar un cupón creando una promoción con
            entrega automática “Cumpleaños” o “Recordatorio de inactividad”.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Días sin visita para recordar" hint="0 = desactivado">
              <Input name="winbackDays" type="number" min={0} max={365} defaultValue={b.winbackDays} />
            </Field>
            <div />
            <Field label="Mensaje de recordatorio">
              <Textarea name="winbackMessage" defaultValue={b.winbackMessage} maxLength={200} />
            </Field>
            <Field label="Mensaje de cumpleaños">
              <Textarea name="birthdayMessage" defaultValue={b.birthdayMessage} maxLength={200} />
            </Field>
          </div>
        </Card>

        <SubmitButton>Guardar programa</SubmitButton>
      </ActionForm>

      <Card title="Catálogo de recompensas (programa de puntos)" className="mt-6">
        {rewards.length > 0 && (
          <ul className="mb-4 divide-y divide-stone-100">
            {rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <strong>{r.name}</strong> — {r.pointsCost.toLocaleString("es-MX")} pts {!r.active && <Badge>Inactiva</Badge>}
                </span>
                <form action={toggleRewardAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="text-xs font-semibold text-brand-700">{r.active ? "Desactivar" : "Activar"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addRewardAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end sm:space-y-0">
          <Field label="Recompensa">
            <Input name="name" placeholder="Café americano" required />
          </Field>
          <Field label="Costo en puntos">
            <Input name="pointsCost" type="number" min={1} required />
          </Field>
          <SubmitButton variant="secondary">Agregar</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
