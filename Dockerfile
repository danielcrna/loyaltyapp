# Imagen de producción (Next.js standalone)
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# CLI de Prisma completo (con todas sus dependencias) para aplicar migraciones al arrancar.
# Se instala aparte porque la salida "standalone" de Next.js solo incluye lo que usa el servidor.
FROM deps AS prisma-cli
RUN PRISMA_VERSION=$(node -p "require('/app/node_modules/prisma/package.json').version") \
  && mkdir -p /prisma-cli && cd /prisma-cli \
  && npm init -y >/dev/null \
  && npm install --omit=dev --no-audit --no-fund "prisma@${PRISMA_VERSION}"

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-cli /prisma-cli /prisma-cli
EXPOSE 3000
# Aplica migraciones pendientes y arranca el servidor
CMD ["sh", "-c", "node /prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && node server.js"]
