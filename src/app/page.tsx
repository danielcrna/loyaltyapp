import Link from "next/link";
import { config } from "@/lib/config";
import { PLANS } from "@/lib/plans";
import { getCurrentUser } from "@/lib/auth";

const FEATURES = [
  { t: "Tarjetas en Apple Wallet y Google Wallet", d: "Tus clientes guardan su tarjeta en el celular en segundos, sin descargar apps." },
  { t: "Sellos, puntos o monedero", d: "Elige el programa ideal: café #10 gratis, puntos canjeables o cashback en cada compra." },
  { t: "Cupones y promociones", d: "Crea cupones con QR, entrégalos a todos tus clientes o automáticamente en su cumpleaños." },
  { t: "Notificaciones push", d: "Envía mensajes que llegan a la pantalla de bloqueo desde la tarjeta guardada en el wallet." },
  { t: "Avisos por cercanía", d: "La tarjeta aparece cuando tu cliente pasa cerca de cualquiera de tus sucursales." },
  { t: "Escáner en cualquier celular", d: "Tu equipo escanea el QR desde el navegador: registra visitas y canjes al instante." },
  { t: "Base de datos de clientes", d: "Nombre, teléfono, correo y cumpleaños de cada miembro, con historial y exportación a Excel." },
  { t: "Recordatorios automáticos", d: "“¡Te extrañamos!” a quienes dejaron de venir y felicitaciones de cumpleaños con regalo." },
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">★</span>
          {config.appName}
        </Link>
        <nav className="flex items-center gap-3 text-sm font-semibold">
          <a href="#precios" className="hidden text-stone-600 sm:block">Precios</a>
          {user ? (
            <Link href={user.businessId ? "/dashboard" : "/admin"} className="rounded-lg bg-brand-600 px-4 py-2 text-white">
              Ir a mi panel
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-stone-700">Entrar</Link>
              <Link href="/registro" className="rounded-lg bg-brand-600 px-4 py-2 text-white">Prueba gratis</Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2">
        <div>
          <p className="mb-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
            Para restaurantes y cafeterías
          </p>
          <h1 className="text-4xl font-black tracking-tight text-stone-900 sm:text-5xl">
            Tu programa de lealtad, directo en el celular de tus clientes.
          </h1>
          <p className="mt-5 text-lg text-stone-600">
            Tarjetas digitales para Apple Wallet y Google Wallet, cupones, notificaciones y avisos por cercanía. Haz que regresen más seguido,
            sin apps ni tarjetas de cartón.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/registro" className="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg hover:bg-brand-700">
              Crear mi programa gratis
            </Link>
            <a href="#como-funciona" className="rounded-xl border border-stone-300 px-6 py-3 font-semibold text-stone-800">
              Cómo funciona
            </a>
          </div>
          <p className="mt-3 text-sm text-stone-500">{config.trialDays} días gratis · Sin tarjeta de crédito</p>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <div className="rotate-2 rounded-3xl bg-stone-900 p-6 text-white shadow-2xl">
            <div className="flex justify-between">
              <span className="font-bold">Café La Esquina</span>
              <span className="text-right text-xs text-amber-300">SELLOS<br /><span className="text-lg text-white">7/10</span></span>
            </div>
            <div className="my-6 grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={`grid aspect-square place-items-center rounded-full border-2 ${i < 7 ? "border-amber-400 bg-amber-400 text-stone-900" : "border-white/40"}`}>
                  {i < 7 ? "✓" : ""}
                </div>
              ))}
            </div>
            <div className="mx-auto size-28 rounded-xl bg-white" />
          </div>
          <div className="absolute -bottom-6 -left-6 w-64 -rotate-3 rounded-2xl border border-stone-200 bg-white/95 p-3 text-sm shadow-xl">
            <div className="text-xs text-stone-500">Wallet · ahora</div>
            <div className="font-semibold">Café La Esquina</div>
            <div className="text-stone-600">¡Estás cerca! Te faltan 3 sellos para tu café gratis ☕</div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="bg-stone-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-black">Cómo funciona</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              ["1", "Configura tu programa", "Elige sellos, puntos o monedero, sube tu logo y tus colores. Listo en 5 minutos."],
              ["2", "Tus clientes escanean tu QR", "Llenan un formulario corto y guardan su tarjeta en Apple Wallet o Google Wallet."],
              ["3", "Escanea en cada visita", "Tu equipo escanea la tarjeta desde cualquier celular y el saldo se actualiza solo en el wallet."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="grid size-10 place-items-center rounded-full bg-brand-600 font-bold text-white">{n}</div>
                <h3 className="mt-4 text-lg font-bold">{t}</h3>
                <p className="mt-1 text-stone-600">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-black">Todo lo que necesitas para fidelizar</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.t} className="rounded-2xl border border-stone-200 p-5">
              <h3 className="font-bold">{f.t}</h3>
              <p className="mt-1 text-sm text-stone-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="precios" className="bg-stone-50 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-black">Precios simples</h2>
          <p className="mt-2 text-center text-stone-600">Precios en pesos mexicanos. Cancela cuando quieras.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLANS.map((p, i) => (
              <div key={p.id} className={`rounded-2xl bg-white p-6 shadow-sm ${i === 1 ? "ring-2 ring-brand-500" : ""}`}>
                <h3 className="text-xl font-bold">{p.name}</h3>
                <div className="my-3 text-4xl font-black">
                  ${p.priceMonthly.toLocaleString("es-MX")}
                  <span className="text-base font-normal text-stone-500">/mes</span>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
                <Link href="/registro" className="mt-6 block rounded-xl bg-brand-600 py-2.5 text-center font-semibold text-white">
                  Empezar prueba gratis
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} {config.appName} ·{" "}
        <Link href="/privacidad" className="underline">Aviso de privacidad</Link> ·{" "}
        <Link href="/terminos" className="underline">Términos</Link>
      </footer>
    </div>
  );
}
