# Guía de configuración y puesta en producción

Orden recomendado: **1) dominio y hospedaje → 2) Google Wallet → 3) Apple Wallet → 4) Stripe → 5) automatizaciones.**
Mientras falte alguna integración, la plataforma funciona igual con la tarjeta web + QR, y el botón de esa billetera simplemente no aparece.

---

## 1. Dominio, base de datos y hospedaje

1. Necesitas una URL **HTTPS** pública y estable (Apple y Google la usan), pero **no hace falta comprar un dominio nuevo**:
   un subdominio de un dominio que ya tengas funciona igual, p. ej. `lealtio.wabistudio.com.mx`.
   - En el panel DNS donde administras `wabistudio.com.mx` crea un registro para `lealtio`:
     `A` → IP de tu servidor (VPS/Oracle Cloud), o `CNAME` → el host que te dé Render/Vercel.
   - Apple y Google no verifican la propiedad del dominio para los pases; solo exigen HTTPS válido (Caddy, Render y Vercel lo dan gratis).
   - **Elige bien desde el inicio:** la URL queda grabada en cada pase de Apple instalado. Si después compras `lealt.io`,
     deja el subdominio viejo apuntando al mismo servidor para que esos pases sigan actualizándose.
   - Evita URLs temporales (túneles tipo `trycloudflare.com` o ngrok gratuito) salvo para pruebas de un día: cambian y rompen los pases.
2. Base de datos: crea un proyecto gratis en [Neon](https://neon.tech) y copia la cadena de conexión a `DATABASE_URL`
   (o usa el Postgres de `docker-compose.yml` si hospedas en tu propio servidor).
3. Variables mínimas (copia `.env.example` a `.env`):
   ```
   DATABASE_URL=...
   APP_URL=https://lealtio.wabistudio.com.mx
   NEXT_PUBLIC_APP_NAME=Lealt.io
   SESSION_SECRET=<openssl rand -hex 32>
   CRON_SECRET=<openssl rand -hex 16>
   SUPERADMIN_EMAILS=tu@correo.com
   ```
4. Despliegue — elige uno:
   - **Servidor propio (gratis con Oracle Cloud Always Free, o cualquier VPS):**
     ```bash
     docker compose --profile app up -d --build
     ```
     Pon delante [Caddy](https://caddyserver.com) para HTTPS automático:
     ```
     lealtio.wabistudio.com.mx {
       reverse_proxy localhost:3000
     }
     ```
   - **Vercel + Neon:** importa el repo en Vercel, agrega las variables y ejecuta `npx prisma migrate deploy` contra la base de Neon.
     El plan Hobby de Vercel es solo para uso no comercial: usa Pro cuando ya cobres.
5. Crea tu cuenta: regístrate en `/registro` con el correo que pusiste en `SUPERADMIN_EMAILS`; verás el superadmin en `/admin`.
   (Para probar con datos de ejemplo: `npm run db:seed`.)

---

## 2. Google Wallet (gratis)

1. Entra a la [Google Pay & Wallet Console](https://pay.google.com/business/console), crea tu perfil de negocio y activa **Google Wallet API**.
   Copia el **Issuer ID** → `GOOGLE_WALLET_ISSUER_ID`.
2. En [Google Cloud Console](https://console.cloud.google.com):
   - Crea un proyecto y habilita **Google Wallet API**.
   - *IAM y administración → Cuentas de servicio → Crear*. Luego *Claves → Agregar clave → JSON*.
   - Del JSON descargado: `client_email` → `GOOGLE_SA_EMAIL`, `private_key` → `GOOGLE_SA_PRIVATE_KEY`
     (puedes pegarla tal cual con los `\n`, o en base64).
3. En la Wallet Console → *Usuarios*: invita el correo de la cuenta de servicio con rol **Desarrollador**.
4. Prueba: inscríbete en `/n/<slug>` de tu negocio y pulsa "Agregar a Google Wallet". En **modo demo** solo funciona para
   usuarios agregados como cuentas de prueba en la consola.
5. Cuando funcione, en la consola pide **acceso de publicación** (*Request publishing access*). Google revisa la clase de un negocio
   como ejemplo. Después, cualquier persona puede guardar pases.

Notas:
- Cada negocio tiene su propia `LoyaltyClass` (`<issuer>.loyalty_<id>`); se crea/actualiza sola al guardar el diseño o el programa.
- Google limita a **3 notificaciones por pase al día**.

---

## 3. Apple Wallet (requiere Apple Developer Program, US$99/año)

### 3.1 Crear el Pass Type ID y su certificado

1. En [developer.apple.com](https://developer.apple.com/account) → *Certificates, IDs & Profiles → Identifiers → +* →
   **Pass Type IDs** → identificador tipo `pass.mx.com.wabistudio.lealtio` (formato DNS invertido; no tiene que coincidir con tu URL ni ser un dominio tuyo, pero **no se puede cambiar** sin reemitir todos los pases). Ese valor va en `APPLE_PASS_TYPE_ID`.
2. Tu **Team ID** (10 caracteres) está en *Membership details* → `APPLE_TEAM_ID`.
3. Genera la llave y la solicitud de firma (CSR) en tu computadora:
   ```bash
   mkdir certs && cd certs
   openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr \
     -subj "/emailAddress=tu@correo.com/CN=Lealt.io Wallet/C=MX"
   ```
4. En el Pass Type ID → *Create Certificate* → sube `pass.csr` → descarga `pass.cer`.
5. Convierte a PEM y descarga el certificado intermedio de Apple (WWDR G4):
   ```bash
   openssl x509 -inform der -in pass.cer -out pass.pem
   curl -O https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
6. Pásalos a variables (base64 en una línea):
   ```bash
   echo "APPLE_PASS_CERT=$(base64 -w0 pass.pem)"
   echo "APPLE_PASS_KEY=$(base64 -w0 pass.key)"
   echo "APPLE_WWDR_CERT=$(base64 -w0 wwdr.pem)"
   ```
   (En macOS usa `base64 -i archivo` sin `-w0`.) **Nunca subas estos archivos al repositorio** (`certs/` está en `.gitignore`).

### 3.2 Probar

- Abre una tarjeta de cliente desde un iPhone y pulsa "Agregar a Apple Wallet".
- Registra una visita en el escáner: en segundos el pase se actualiza solo (push APNs → el iPhone descarga la nueva versión).
- Envía una notificación desde *Notificaciones*: llega como aviso de Wallet.
- Si algo falla, el iPhone reporta errores a `POST /api/apple/v1/log` (se guardan en la tabla `AppleLog`).
  En el iPhone también puedes activar *Ajustes → Desarrollador → PassKit Testing* para ver más detalle.

Notas:
- El certificado del Pass Type ID **vence cada año**: renuévalo con el mismo procedimiento antes de que caduque o los pases dejarán de actualizarse.
- Los avisos por cercanía (máx. 10 sucursales por pase) los decide iOS: requiere ubicación activada para Wallet y la opción
  "Sugerir en pantalla de bloqueo" del pase.

---

## 4. Stripe (cobrar la suscripción a los negocios)

1. Crea tu cuenta en [Stripe](https://dashboard.stripe.com) (México) y completa la activación.
2. *Catálogo de productos*: crea 3 productos (Básico, Pro, Empresarial) con precio **recurrente mensual en MXN**.
   Copia cada `price_...` a `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`.
   Ajusta nombres, precios y límites en `src/lib/plans.ts` para que coincidan.
3. *Desarrolladores → Claves API*: `STRIPE_SECRET_KEY`.
4. *Desarrolladores → Webhooks → Agregar endpoint*: `https://lealtio.wabistudio.com.mx/api/stripe/webhook` con los eventos
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
   Copia el *signing secret* → `STRIPE_WEBHOOK_SECRET`.
5. *Configuración → Portal de clientes*: actívalo y permite cambiar entre tus 3 productos, actualizar tarjeta y cancelar.
6. Prueba con el modo de prueba de Stripe (tarjeta `4242 4242 4242 4242`).

Comportamiento: cada negocio nuevo recibe `TRIAL_DAYS` días de prueba. Al vencer sin suscripción, el panel muestra un aviso y el
escáner deja de registrar movimientos (los clientes conservan su tarjeta y saldo). Si Stripe no está configurado, todo queda activo
(útil en desarrollo). Desde `/admin` puedes cambiar plan/estado manualmente o extender pruebas.

---

## 5. Automatizaciones diarias

`/api/cron` expira cupones, envía felicitaciones de cumpleaños (+ cupón si hay una promoción "En su cumpleaños") y recordatorios
de inactividad (+ cupón "Recordatorio de inactividad"). Prográmalo una vez al día con `Authorization: Bearer $CRON_SECRET`:

- **GitHub Actions (gratis):** `.github/workflows/cron.yml` ya está incluido. Agrega los secretos `APP_URL` y `CRON_SECRET`
  y la variable de repositorio `ENABLE_CRON=true`.
- **Vercel:** `vercel.json` ya lo programa (Vercel envía `CRON_SECRET` automáticamente si defines esa variable).
- **cron-job.org** o `crontab` en tu VPS:
  ```bash
  0 15 * * * curl -fsS -X POST -H "Authorization: Bearer TU_CRON_SECRET" https://lealtio.wabistudio.com.mx/api/cron
  ```

---

## 6. Lista de verificación antes de lanzar

- [ ] `APP_URL` con HTTPS y dominio definitivo (cambiarlo después invalida la URL del web service de los pases ya instalados).
- [ ] `SESSION_SECRET` largo y aleatorio.
- [ ] Google Wallet con acceso de publicación aprobado.
- [ ] Certificado de Apple vigente y recordatorio de renovación anual.
- [ ] Webhook de Stripe respondiendo 200 (revisa en el dashboard de Stripe).
- [ ] Cron diario funcionando.
- [ ] Aviso de privacidad y términos revisados por un abogado y con tus datos de contacto.
- [ ] Respaldos automáticos de la base de datos (Neon los incluye; en VPS usa `pg_dump` diario).
- [ ] Reemplazar los botones "Agregar a Apple/Google Wallet" por los badges oficiales (`src/components/wallet-buttons.tsx`).
