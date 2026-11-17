import { requireBusinessUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Checkbox, Field, Input, PageHeader } from "@/components/ui";
import { CardView } from "@/components/card-view";
import { saveDesignAction } from "./actions";

export const metadata = { title: "Diseño de tarjeta" };

export default async function DesignPage() {
  const { business: b } = await requireBusinessUser();
  return (
    <>
      <PageHeader title="Diseño de tarjeta" description="Así verán tus clientes su tarjeta en Apple Wallet, Google Wallet y en la web." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <ActionForm action={saveDesignAction}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre del negocio">
                <Input name="name" defaultValue={b.name} maxLength={60} />
              </Field>
              <Field label="Teléfono (aparece al reverso del pase)">
                <Input name="phone" defaultValue={b.phone ?? ""} />
              </Field>
              <Field label="Sitio web o Instagram" className="sm:col-span-2">
                <Input name="website" type="url" placeholder="https://" defaultValue={b.website ?? ""} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Fondo">
                <Input name="bgColor" type="color" defaultValue={b.bgColor} className="h-11 p-1" />
              </Field>
              <Field label="Texto">
                <Input name="fgColor" type="color" defaultValue={b.fgColor} className="h-11 p-1" />
              </Field>
              <Field label="Etiquetas / sellos">
                <Input name="labelColor" type="color" defaultValue={b.labelColor} className="h-11 p-1" />
              </Field>
            </div>
            <Field label="Logo" hint="PNG con fondo transparente, horizontal o cuadrado. Máx. 3 MB.">
              <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
            </Field>
            {b.logoId && <Checkbox name="removeLogo" label="Quitar logo actual" />}
            <Field label="Imagen de fondo de la franja (opcional)" hint="Foto de tu producto o local. Se recorta a 1125 × 369 px aprox.">
              <Input name="strip" type="file" accept="image/png,image/jpeg,image/webp" />
            </Field>
            {b.stripId && <Checkbox name="removeStrip" label="Quitar imagen de franja" />}
            <SubmitButton>Guardar diseño</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-3">
          <p className="text-sm font-semibold text-stone-600">Vista previa</p>
          <CardView business={b} />
          <p className="text-xs text-stone-500">
            La apariencia final varía ligeramente entre Apple Wallet y Google Wallet (Google muestra el logo en círculo).
          </p>
        </div>
      </div>
    </>
  );
}
