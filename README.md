# Lealt.io — plataforma SaaS de programas de lealtad para restaurantes y cafeterías

Plataforma multi-negocio para vender, como servicio hospedado, programas de lealtad con tarjetas digitales en
**Apple Wallet** y **Google Wallet**, cupones, notificaciones y avisos por cercanía.

> El nombre comercial (por defecto "Lealt.io") se configura con `NEXT_PUBLIC_APP_NAME`; logotipo y branding pendientes.

## Funciones

**Para los negocios (panel `/dashboard`)**
- Registro con prueba gratis y suscripción mensual con Stripe (3 planes con límites de sucursales, clientes y usuarios).
- Programa a elegir: **sellos/visitas**, **puntos** (con catálogo de recompensas) o **monedero electrónico** (cashback), con bono de bienvenida.
- Diseño de tarjeta: logo, colores e imagen de franja; vista previa en vivo. Sellos con diseño **predeterminado** o **personalizado** (imagen propia para sello obtenido y, opcionalmente, para sello pendiente); la franja de sellos se genera automáticamente.
- **Clientes (CRM):** nombre, teléfono, correo, cumpleaños, consentimiento de promociones, historial, ajustes manuales, búsqueda, exportación CSV y eliminación (derechos ARCO).
- **Cupones y promociones** con QR, vigencia y entrega manual, masiva o automática (al inscribirse, en el cumpleaños o por inactividad).
- **Cupones por QR** (`/promo/<token>`): cartel imprimible; el cliente escanea y el cupón se agrega a su tarjeta (un toque si su navegador ya la conoce, por teléfono/correo, o inscribiéndose en ese momento). Límite opcional de reclamos.
- **Revocar cupones** entregados por error o de prueba: individualmente desde la ficha del cliente o todos los activos de una promoción.
- **Marca blanca (plan Empresarial):** logotipo propio en el panel y en las páginas públicas, sin la leyenda de la plataforma.
- **Notificaciones** a todos los clientes o por segmento, que llegan a la tarjeta guardada en el wallet.
- **Sucursales** con coordenadas y mensaje personalizado de pantalla de bloqueo → avisos por cercanía.
- Equipo con roles (dueño, gerente, cajero).
- QR de inscripción y cartel para imprimir.

**Para el personal (escáner `/escaner`, PWA instalable)**
- Escanea con la cámara el QR de la tarjeta o del cupón (o captura el código / busca por teléfono).
- Suma sellos, puntos o cashback; canjea recompensas, saldo y cupones. El pase en el wallet se actualiza solo.

**Para los clientes finales (sin descargar apps)**
- Inscripción en `/n/<negocio>` → tarjeta web `/tarjeta/<código>` con botones "Agregar a Apple Wallet / Google Wallet".
- Cupones en `/cupon/<código>`, también guardables en el wallet.
- Notificaciones de cambios de saldo, mensajes del negocio, cumpleaños, recordatorios y avisos al pasar cerca de una sucursal.

**Para ti (superadmin `/admin`)**
- Lista de negocios, estado de suscripción, MRR estimado; cambio manual de plan/estado y extensión de pruebas.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 ·
passkit-generator (Apple) · Google Wallet REST API · APNs HTTP/2 nativo · Stripe · html5-qrcode · sharp · vitest.
Todo es software libre/gratuito; el único costo obligatorio es Apple Developer Program (US$99/año) para Apple Wallet.

## Inicio rápido (desarrollo)

```bash
cp .env.example .env            # ajusta DATABASE_URL si es necesario
docker compose up -d db         # Postgres local (o usa tu propio Postgres/Neon)
npm install
npx prisma migrate deploy
npm run db:seed                 # datos de ejemplo (opcional)
npm run dev                     # http://localhost:3000
```

Accesos del seed (contraseña `demo1234`): `dueno@demo.com` (dueño), `cajero@demo.com` (escáner), `admin@demo.com` (superadmin).
Página de inscripción de ejemplo: `/n/cafe-demo`.

Sin credenciales de Apple/Google/Stripe la plataforma funciona completa con tarjeta web + QR; cada integración se activa al
agregar sus variables. Guía paso a paso: **[docs/CONFIGURACION.md](docs/CONFIGURACION.md)**.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm test` | Pruebas unitarias del motor de lealtad |
| `npm run lint` | Verificación de tipos (TypeScript) |
| `npm run db:migrate` | Crear una migración nueva tras cambiar `prisma/schema.prisma` |
| `npm run db:deploy` | Aplicar migraciones en producción |
| `npm run db:seed` | Datos de demostración |

## Estructura

```
prisma/schema.prisma          Modelo de datos (negocios, clientes, tarjetas, transacciones, cupones, registros de Apple)
src/lib/loyalty.ts            Reglas del programa (funciones puras, con pruebas en tests/)
src/lib/services.ts           Inscripción, compras, canjes y cupones (con bloqueo de fila para evitar canjes dobles)
src/lib/wallet/apple.ts       Generación de pases .pkpass (tarjeta y cupón)
src/lib/wallet/apns.ts        Push APNs para actualizar pases
src/lib/wallet/google.ts      Clases/objetos de Google Wallet, mensajes y enlace "Guardar"
src/lib/wallet/sync.ts        Sincronización con ambas billeteras tras cada cambio
src/lib/automations.ts        Cumpleaños, recordatorios de inactividad y cupones vencidos
src/lib/stripe.ts             Checkout, portal y sincronización de suscripciones
src/app/api/apple/v1/...      Web service de Apple Wallet (registro de dispositivos y descarga de pases)
src/app/dashboard/...         Panel del negocio
src/app/escaner/...           Escáner PWA
src/app/n/[slug], tarjeta/, cupon/   Páginas públicas para clientes
src/app/admin                 Superadmin de la plataforma
docs/                         Investigación y guía de configuración
```

## Endpoints de integración

| Ruta | Uso |
|---|---|
| `/api/apple/v1/*` | Web service de Apple Wallet (`webServiceURL` de los pases) |
| `/api/wallet/apple/card/:serial`, `/api/wallet/apple/coupon/:code` | Descarga de `.pkpass` |
| `/api/wallet/google/card/:serial`, `/api/wallet/google/coupon/:code` | Redirección a "Guardar en Google Wallet" |
| `/api/stripe/webhook` | Webhook de Stripe |
| `/api/cron` | Automatizaciones diarias (`Authorization: Bearer $CRON_SECRET`) |
| `/api/export/clientes` | CSV de clientes del negocio |

## Limitaciones conocidas

- Los avisos por cercanía de Apple y Google son **pasivos**: los decide el sistema operativo del cliente y requieren permisos de ubicación; no están garantizados.
- Google Wallet permite máximo 3 notificaciones por pase al día y requiere aprobación de publicación.
- El estado "guardado en Google Wallet" se marca al pulsar el botón (Google no confirma el guardado sin configurar *callbacks*).
- Textos legales (`/privacidad`, `/terminos`) son plantillas que deben revisarse.

Más detalle en **[docs/INVESTIGACION.md](docs/INVESTIGACION.md)**.
