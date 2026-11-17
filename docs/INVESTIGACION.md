# Investigación: qué se necesita para operar Lealt.io

Resumen de requisitos técnicos, costos, herramientas gratuitas y limitaciones reales de cada pieza del sistema
(revisado en noviembre de 2026). Las fuentes están al final.

## 1. Mapa del sistema

```
 Cliente final                      Negocio (tu cliente)                 Tú (plataforma)
 ─────────────                      ────────────────────                 ───────────────
 Escanea QR del cartel ──► /n/slug  Panel /dashboard                     Superadmin /admin
 Formulario de inscripción          · Programa (sellos/puntos/monedero)  · Negocios, planes, MRR
 Tarjeta web /tarjeta/X             · Diseño, sucursales, promos         Stripe (cobro mensual)
   ├─ Agregar a Apple Wallet ──┐    · Clientes (CRM + CSV)
   └─ Agregar a Google Wallet ─┤    · Notificaciones
                               │    Escáner PWA /escaner (cajeros)
 Apple Wallet ◄── APNs push ───┤        └─ suma / canjea → actualiza pases
   └─ pide pase nuevo a /api/apple/v1/...
 Google Wallet ◄── Google Wallet API (REST) ──┘
```

## 2. Apple Wallet

| Tema | Detalle |
|---|---|
| Requisito | **Apple Developer Program (US$99/año)**. Es el único costo que no tiene alternativa gratuita. Un solo *Pass Type ID* sirve para todos los negocios de la plataforma: cada pase lleva el nombre, logo y colores del negocio. |
| Generación | Archivo `.pkpass` (zip firmado con el certificado del Pass Type ID + certificado WWDR G4). Librería gratuita: [`passkit-generator`](https://www.npmjs.com/package/passkit-generator) (MIT). |
| Estilos | Tarjeta de lealtad = `storeCard`; cupones = `coupon`. |
| Actualizaciones | El pase incluye `webServiceURL` y `authenticationToken`. El iPhone se registra en tu servidor (5 endpoints REST). Cuando cambia el saldo, el servidor manda un push APNs vacío con el **mismo certificado** del Pass Type ID; el iPhone descarga el pase nuevo. |
| Notificaciones "push" | No hay mensajes libres como en una app: se logra cambiando un campo que tenga `changeMessage` (p. ej. "Novedades: %@"). iOS muestra el texto nuevo como notificación de Wallet. Así se implementan las notificaciones masivas, de cumpleaños y de "te extrañamos". |
| Avisos por cercanía | Campo `locations` (máx. **10** ubicaciones por pase) con `relevantText`. iOS muestra el pase en la pantalla de bloqueo al estar cerca (~100 m para tarjetas/cupones). **Es pasivo y lo decide iOS**: requiere ubicación activada para Wallet y la opción "Sugerir en pantalla de bloqueo" del pase; no está garantizado y no es una notificación con sonido. |
| Fechas | Desde iOS 18 `relevantDate` está obsoleto en favor de `relevantDates` (no lo usamos para tarjetas de lealtad). |
| HTTPS | `webServiceURL` debe ser HTTPS en producción. |

## 3. Google Wallet

| Tema | Detalle |
|---|---|
| Costo | **Gratis**. Cuenta de emisor en Google Pay & Wallet Console + proyecto de Google Cloud con la Google Wallet API y una cuenta de servicio. |
| Modelo | `LoyaltyClass` por negocio (diseño, logo, sucursales) y `LoyaltyObject` por cliente (saldo, QR). Cupones: `OfferClass` por promoción + `OfferObject` por cupón. |
| Botón "Agregar" | Enlace `https://pay.google.com/gp/v/save/<JWT>` firmado con la llave de la cuenta de servicio. |
| Aprobación | La cuenta empieza en **modo demo**: solo usuarios de prueba pueden guardar pases. Para clientes reales hay que pedir **acceso de publicación** (requiere perfil de negocio completo y al menos una clase creada). |
| Notificaciones | `addMessage` con `messageType: TEXT_AND_NOTIFY` (a un objeto o a toda la clase) o actualizar `loyaltyPoints.balance` con `notifyPreference`. **Límite: 3 notificaciones por pase cada 24 h.** El usuario debe tener activadas las notificaciones de Wallet. |
| Avisos por cercanía | `merchantLocations` en la clase. Google decide el radio, el tiempo y **el texto** de la notificación; requiere ubicación precisa "siempre" para Wallet. Igual que en Apple: no garantizado. |
| Límite de API | 20 solicitudes/segundo. |

## 4. Escaneo de QR en el negocio

- **PWA en el navegador** (sin publicar en tiendas): cámara vía `getUserMedia` con la librería gratuita `html5-qrcode`. Funciona en cualquier celular/tablet con HTTPS y se puede "instalar" en la pantalla de inicio.
- Alternativa futura: app nativa (React Native/Expo) o lectores USB tipo teclado (ya funcionan con el campo de captura manual).
- El QR contiene un código aleatorio no adivinable (`C…` tarjeta, `P…` cupón); el canje valida que pertenezca al negocio y bloquea la fila para evitar canjes dobles.

## 5. Cobro a los negocios (Stripe)

- Stripe opera en México: suscripciones recurrentes con tarjeta, Checkout alojado, portal de cliente (cambiar plan, actualizar tarjeta, facturas) y webhooks. Sin mensualidad; comisión por cobro (en México aprox. 3.6 % + MX$3 + IVA por cargo con tarjeta nacional; verifica la tarifa vigente).
- OXXO está disponible en Stripe México pero es un pago único con voucher, no sirve bien para cobro recurrente automático.
- Facturación CFDI: Stripe no timbra CFDI. Si necesitas facturar a tus clientes en México, integra un PAC (p. ej. Facturapi, que tiene plan gratuito para pocos timbres) — pendiente para una fase 2.

## 6. Herramientas y plataformas gratuitas usadas

| Pieza | Herramienta | Licencia / costo |
|---|---|---|
| Framework web (frontend + API) | Next.js 16 + React 19 | MIT, gratis |
| Base de datos | PostgreSQL + Prisma ORM | Gratis |
| Estilos | Tailwind CSS 4 | MIT |
| Pases Apple | passkit-generator | MIT |
| Push Apple | `node:http2` nativo (sin dependencias) | — |
| Google Wallet | google-auth-library + jose (JWT) | Apache-2.0 / MIT |
| QR | qrcode (generar), html5-qrcode (leer) | MIT / Apache-2.0 |
| Imágenes de pases | sharp (genera íconos, logos y la franja de sellos) | Apache-2.0 |
| Pagos | Stripe SDK | MIT (comisión por cobro) |
| Validación | zod | MIT |
| Pruebas | vitest, Playwright | MIT / Apache-2.0 |

### Hospedaje (opciones)

| Opción | Costo | Notas |
|---|---|---|
| **Oracle Cloud Always Free** (VM ARM) + Docker | Gratis | Uso comercial permitido; tú administras el servidor. Usa Caddy para HTTPS gratis (Let's Encrypt). |
| **Neon** (Postgres) | Gratis hasta 0.5 GB | Escala a cero; ideal para empezar. Supabase también tiene plan gratis (pausa tras 1 semana sin uso). |
| Render (web) | Gratis con suspensión tras 15 min | El arranque en frío (~30 s) puede hacer fallar las peticiones de Apple/Google; mejor el plan de pago. |
| Vercel | Hobby gratis **solo uso no comercial**; Pro US$20/mes | Cuando ya cobres, Vercel Pro + Neon es lo más sencillo. |
| Dominio | ~MX$250–400/año | Obligatorio: Apple y Google requieren una URL HTTPS estable. |

### Tareas programadas (automatizaciones diarias)

- `vercel.json` (si usas Vercel) o el workflow de GitHub Actions incluido (`.github/workflows/cron.yml`, gratis) o cron-job.org (gratis).

## 7. Aspectos legales (México)

- **LFPDPPP**: el negocio es *responsable* de los datos de sus clientes y tu plataforma es *encargada*. Necesitas aviso de privacidad (se incluye una plantilla en `/privacidad`), consentimiento para promociones (casilla separada en el formulario) y atender derechos ARCO (el panel permite editar y eliminar definitivamente a un cliente, y exportar sus datos).
- La plataforma **no rastrea la ubicación** del cliente: los avisos por cercanía los calcula su teléfono.
- Los textos legales incluidos son plantillas: revísalos con un abogado.

## 8. Comparación con plataformas de referencia

No fue posible abrir easyloyalty.io ni loyicard.com desde el entorno de desarrollo (la red del entorno no los resolvía), así que no se compararon sus funciones ni precios directamente. Por los listados públicos de este tipo de producto (Loopy Loyalty, Alvy, Yoybo, LoyiCard), las funciones comunes del mercado son: sellos/puntos/cashback, Apple/Google Wallet sin app, QR de inscripción, escáner web, cupones, notificaciones push y geolocalización, CRM con exportación, multi-sucursal y planes mensuales desde ~US$15–25. Esta plataforma cubre todas esas funciones base.

**Ideas para fases siguientes** (no incluidas aún): niveles/tiers (bronce/plata/oro), programa de referidos, tarjetas de regalo, integración con POS (Square, Clip, Toast, Parrot Software) para sumar automáticamente desde el ticket, envío por WhatsApp/SMS/correo, facturación CFDI, reportes avanzados de retención y una app nativa del escáner.

## Fuentes

- Apple — Wallet Developer Guide (relevancia, tamaños de radio): https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html
- Apple — Actualizar pases con un web service: https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Updating.html
- Apple — `relevantDates` (iOS 18): https://developer.apple.com/documentation/walletpasses/pass/relevantdates-data.dictionary
- Apple Developer Forums — `relevantDate` obsoleto en iOS 18: https://developer.apple.com/forums/thread/769951
- passkit-generator: https://www.npmjs.com/package/passkit-generator
- Google Wallet — Notificaciones push en tarjetas de lealtad: https://developers.google.com/wallet/retail/loyalty-cards/use-cases/trigger-push-notifications
- Google Wallet — Referencia LoyaltyObject: https://developers.google.com/wallet/reference/rest/v1/loyaltyobject
- Google Wallet — FAQ de tarjetas de lealtad (modo demo, acceso de publicación, límite de API): https://developers.google.com/wallet/retail/loyalty-cards/resources/faq
- Límite de 10 ubicaciones y comportamiento pasivo (guías de proveedores): https://spatie.be/docs/laravel-mobile-pass/v1/apple-wallet/pass-relevance , https://www.airship.com/docs/guides/wallet/user-guide/notifications/triggers/
- Stripe en México: https://stripe.com/newsroom/news/stripe-launches-mexico · OXXO: https://docs.stripe.com/payments/oxxo
- Planes gratuitos de hospedaje 2026: https://flaviocopes.com/hosting-free-tiers/ , https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026
