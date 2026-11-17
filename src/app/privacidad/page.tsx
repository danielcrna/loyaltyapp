import { config } from "@/lib/config";

export const metadata = { title: "Aviso de privacidad" };

// PLANTILLA: revisa este texto con un abogado antes de publicar (LFPDPPP, México).
export default function PrivacyPage() {
  return (
    <article className="prose mx-auto max-w-3xl space-y-4 px-4 py-12 text-stone-800">
      <h1 className="text-3xl font-bold">Aviso de privacidad</h1>
      <p className="text-sm text-stone-500">Plantilla — debe revisarse y completarse con los datos del responsable antes de publicarse.</p>
      <p>
        {config.appName} (la “Plataforma”) presta servicios de programas de lealtad a negocios (los “Comercios”). Cuando te inscribes al
        programa de un Comercio, ese Comercio es el <strong>responsable</strong> de tus datos personales y la Plataforma actúa como{" "}
        <strong>encargado</strong> que los trata por su cuenta.
      </p>
      <h2 className="text-xl font-bold">Datos que recabamos</h2>
      <p>Nombre, teléfono, correo electrónico y fecha de cumpleaños (opcional), así como tu historial de visitas, compras registradas y canjes.</p>
      <h2 className="text-xl font-bold">Finalidades</h2>
      <p>
        Primarias: administrar tu tarjeta de lealtad, registrar visitas, saldos, recompensas y cupones. Secundarias (puedes negarte): enviarte
        promociones, recordatorios y felicitaciones de cumpleaños.
      </p>
      <h2 className="text-xl font-bold">Ubicación</h2>
      <p>
        La Plataforma <strong>no</strong> rastrea tu ubicación. Los avisos por cercanía los genera tu propio teléfono (Apple Wallet / Google
        Wallet) comparando tu ubicación con las sucursales incluidas en el pase; esa información no se nos envía.
      </p>
      <h2 className="text-xl font-bold">Derechos ARCO</h2>
      <p>
        Puedes solicitar acceso, rectificación, cancelación u oposición al tratamiento de tus datos contactando al Comercio o escribiendo a
        [correo de privacidad]. Puedes eliminar la tarjeta de tu wallet en cualquier momento.
      </p>
      <h2 className="text-xl font-bold">Transferencias</h2>
      <p>
        Tus datos no se venden. Se comparten únicamente con proveedores necesarios para operar el servicio (alojamiento, Apple y Google para
        las billeteras digitales).
      </p>
    </article>
  );
}
