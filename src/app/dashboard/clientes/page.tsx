import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireBusinessUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, ButtonLink, Card, Checkbox, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import { addCustomerAction } from "./actions";

export const metadata = { title: "Clientes" };
const PAGE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const { q = "", p = "1" } = await searchParams;
  const { business: b } = await requireBusinessUser();
  const page = Math.max(1, Number(p) || 1);
  const where: Prisma.CustomerWhereInput = {
    businessId: b.id,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q.replace(/\D/g, "") || q } },
            { card: { serial: { equals: q.toUpperCase() } } },
          ],
        }
      : {}),
  };
  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({ where, include: { card: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const balance = (c: (typeof customers)[number]) => {
    if (!c.card) return "—";
    if (b.programType === "POINTS") return `${c.card.points} pts`;
    if (b.programType === "CASHBACK") return formatMoney(c.card.cashbackCents, b.currency);
    return `${c.card.stamps}/${b.stampsRequired}${c.card.rewardsAvailable ? ` +${c.card.rewardsAvailable}🎁` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${total.toLocaleString("es-MX")} cliente(s) inscritos en tu programa.`}
        actions={
          <ButtonLink href="/api/export/clientes" variant="secondary">
            Exportar CSV
          </ButtonLink>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <form className="mb-4 flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Buscar por nombre, correo, teléfono o código" />
            <button className="rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white">Buscar</button>
          </form>
          {customers.length === 0 ? (
            <EmptyState title={q ? "Sin resultados" : "Aún no tienes clientes"}>
              {!q && "Comparte tu QR de inscripción o agrega clientes manualmente."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-xs text-stone-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Contacto</th>
                    <th className="px-4 py-3">Saldo</th>
                    <th className="px-4 py-3">Visitas</th>
                    <th className="px-4 py-3">Wallet</th>
                    <th className="px-4 py-3">Alta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/clientes/${c.id}`} className="font-medium text-stone-900 hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-600">
                        {c.phone && <div>{c.phone}</div>}
                        {c.email && <div>{c.email}</div>}
                      </td>
                      <td className="px-4 py-3">{balance(c)}</td>
                      <td className="px-4 py-3">{c.card?.visits ?? 0}</td>
                      <td className="px-4 py-3 space-x-1">
                        {c.card?.appleInstalled && <Badge>Apple</Badge>}
                        {c.card?.googleSaved && <Badge tone="blue">Google</Badge>}
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-500">{formatDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-stone-500">
                Página {page} de {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 && <ButtonLink variant="secondary" href={`?q=${encodeURIComponent(q)}&p=${page - 1}`}>Anterior</ButtonLink>}
                {page < pages && <ButtonLink variant="secondary" href={`?q=${encodeURIComponent(q)}&p=${page + 1}`}>Siguiente</ButtonLink>}
              </div>
            </div>
          )}
        </div>
        <Card title="Agregar cliente">
          <ActionForm action={addCustomerAction} resetOnSuccess>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Teléfono">
              <Input name="phone" type="tel" />
            </Field>
            <Field label="Correo">
              <Input name="email" type="email" />
            </Field>
            <Field label="Cumpleaños">
              <Input name="birthday" type="date" />
            </Field>
            <Checkbox name="consent" label="El cliente acepta recibir promociones" />
            <SubmitButton>Agregar</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
