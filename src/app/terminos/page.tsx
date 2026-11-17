import { config } from "@/lib/config";

export const metadata = { title: "Términos y condiciones" };

// PLANTILLA: revisa este texto con un abogado antes de publicar.
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-12 text-stone-800">
      <h1 className="text-3xl font-bold">Términos y condiciones</h1>
      <p className="text-sm text-stone-500">Plantilla — debe revisarse antes de publicarse.</p>
      <p>
        {config.appName} ofrece a negocios una plataforma por suscripción para operar programas de lealtad con tarjetas digitales. El Comercio
        es responsable de las reglas de su programa, de las recompensas y promociones que ofrece y de contar con el consentimiento de sus
        clientes para tratar sus datos.
      </p>
      <p>
        La suscripción se cobra mensualmente por adelantado mediante Stripe y puede cancelarse en cualquier momento desde el panel; el acceso
        continúa hasta el final del periodo pagado. Los límites de cada plan (sucursales, clientes y usuarios) se muestran en la página de
        precios.
      </p>
      <p>
        Apple Wallet y Google Wallet son marcas de sus respectivos dueños. La entrega de notificaciones y avisos por cercanía depende de esas
        plataformas y de la configuración del dispositivo del cliente, por lo que no se garantiza su entrega.
      </p>
    </article>
  );
}
