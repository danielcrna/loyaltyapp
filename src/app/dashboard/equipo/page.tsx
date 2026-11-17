import { requireBusinessUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { addMemberAction, changePasswordAction, removeMemberAction } from "./actions";

export const metadata = { title: "Equipo" };
const ROLE = { OWNER: "Dueño", MANAGER: "Gerente", STAFF: "Cajero / mesero" } as const;

export default async function TeamPage() {
  const user = await requireBusinessUser(["OWNER"]);
  const members = await db.user.findMany({ where: { businessId: user.business.id }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader
        title="Equipo"
        description="Los cajeros solo acceden al escáner para registrar visitas y canjes. Los gerentes además ven clientes y promociones."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <ul className="divide-y divide-stone-100">
            {members.map((m) => (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {m.name} <Badge tone={m.role === "OWNER" ? "amber" : m.role === "MANAGER" ? "blue" : "stone"}>{ROLE[m.role]}</Badge>
                    </div>
                    <div className="text-xs text-stone-500">
                      {m.email} · último acceso {formatDateTime(m.lastLoginAt)}
                    </div>
                  </div>
                  {m.role !== "OWNER" && (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="text-xs font-semibold text-red-700">Quitar acceso</button>
                    </form>
                  )}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-brand-700">Cambiar contraseña</summary>
                  <ActionForm action={changePasswordAction} className="mt-2 flex gap-2 space-y-0" resetOnSuccess>
                    <input type="hidden" name="id" value={m.id} />
                    <Input name="password" type="password" minLength={8} placeholder="Nueva contraseña" required />
                    <SubmitButton variant="secondary" className="shrink-0">Guardar</SubmitButton>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Agregar usuario">
          <ActionForm action={addMemberAction} resetOnSuccess>
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Correo">
              <Input name="email" type="email" required />
            </Field>
            <Field label="Contraseña inicial">
              <Input name="password" type="password" minLength={8} required />
            </Field>
            <Field label="Rol">
              <Select name="role" defaultValue="STAFF">
                <option value="STAFF">Cajero / mesero (solo escáner)</option>
                <option value="MANAGER">Gerente</option>
              </Select>
            </Field>
            <SubmitButton>Crear usuario</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
