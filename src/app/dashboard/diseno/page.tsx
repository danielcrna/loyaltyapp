import Link from "next/link";
import { requireBusinessUser } from "@/lib/auth";
import { getPlan } from "@/lib/plans";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Checkbox, Field, Input, Notice, PageHeader } from "@/components/ui";
import { CardView } from "@/components/card-view";
import { saveBrandAction, saveDesignAction } from "./actions";

export const metadata = { title: "Diseño de tarjeta" };

export default async function DesignPage() {
  const { business: b } = await requireBusinessUser();
  const whiteLabel = getPlan(b.plan).whiteLabel;
  return (
    <>
      <PageHeader title="Diseño de tarjeta" description="Así verán tus clientes su tarjeta en Apple Wallet, Google Wallet y en la web." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
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
              <Field label="Logo de la tarjeta" hint="PNG con fondo transparente, horizontal o cuadrado. Máx. 3 MB.">
                <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
              </Field>
              {b.logoId && <Checkbox name="removeLogo" label="Quitar logo actual" />}
              <Field label="Imagen de fondo de la franja (opcional)" hint="Foto de tu producto o local. Se recorta a 1125 × 369 px aprox.">
                <Input name="strip" type="file" accept="image/png,image/jpeg,image/webp" />
              </Field>
              {b.stripId && <Checkbox name="removeStrip" label="Quitar imagen de franja" />}

              <fieldset className="space-y-3 rounded-xl border border-stone-200 p-4">
                <legend className="px-1 text-sm font-semibold text-stone-700">Diseño de los sellos</legend>
                {b.programType !== "STAMPS" && (
                  <p className="text-xs text-stone-500">Solo se usa en el programa de sellos; puedes dejarlo listo por si cambias de programa.</p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="cursor-pointer rounded-xl border border-stone-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input type="radio" name="stampStyle" value="default" defaultChecked={b.stampStyle !== "custom"} className="accent-brand-600" />
                    <span className="ml-2 text-sm font-semibold">Predeterminado</span>
                    <p className="mt-1 text-xs text-stone-600">Círculos con palomita en el color de etiquetas.</p>
                  </label>
                  <label className="cursor-pointer rounded-xl border border-stone-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input type="radio" name="stampStyle" value="custom" defaultChecked={b.stampStyle === "custom"} className="accent-brand-600" />
                    <span className="ml-2 text-sm font-semibold">Personalizado</span>
                    <p className="mt-1 text-xs text-stone-600">Tu propia imagen: una taza, tu logo, un grano de café…</p>
                  </label>
                </div>
                <Field
                  label="Imagen del sello obtenido"
                  hint={
                    <>
                      PNG cuadrado con fondo transparente (recomendado 300 × 300 px).
                      {b.stampIconId && " Ya tienes una imagen; sube otra solo si quieres cambiarla."}
                    </>
                  }
                >
                  <Input name="stampIcon" type="file" accept="image/png,image/webp" />
                </Field>
                <Field
                  label="Imagen del sello pendiente (opcional)"
                  hint="Si no subes una, se usa la silueta del sello obtenido en el color del texto, semitransparente."
                >
                  <Input name="stampEmptyIcon" type="file" accept="image/png,image/webp" />
                </Field>
                {b.stampEmptyIconId && <Checkbox name="removeStampEmpty" label="Quitar imagen de sello pendiente" />}
              </fieldset>

              <SubmitButton>Guardar diseño</SubmitButton>
            </ActionForm>
          </Card>

          <Card
            title={
              <>
                Logotipo de marca <Badge tone={whiteLabel ? "green" : "amber"}>Plan Empresarial</Badge>
              </>
            }
          >
            <p className="mb-4 text-sm text-stone-600">
              Muestra tu logotipo en tu panel y en la página de inscripción de clientes en lugar de la marca de la plataforma.
            </p>
            {whiteLabel ? (
              <ActionForm action={saveBrandAction} resetOnSuccess>
                {b.brandLogoId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/media/${b.brandLogoId}`} alt="Logotipo actual" className="h-14 max-w-[220px] object-contain" />
                )}
                <Field label="Logotipo" hint="PNG con fondo transparente, preferentemente horizontal. Máx. 3 MB.">
                  <Input name="brandLogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
                </Field>
                {b.brandLogoId && <Checkbox name="removeBrandLogo" label="Quitar logotipo de marca" />}
                <SubmitButton variant="secondary">Guardar logotipo</SubmitButton>
              </ActionForm>
            ) : (
              <Notice>
                Disponible en el plan Empresarial.{" "}
                <Link href="/dashboard/facturacion" className="font-semibold underline">
                  Ver planes
                </Link>
              </Notice>
            )}
          </Card>
        </div>
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
