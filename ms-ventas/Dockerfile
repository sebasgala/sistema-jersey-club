# syntax=docker/dockerfile:1.7
# Imagen de producción de ms-ventas: compilación en etapas, usuario sin privilegios y healthcheck.
# Construir:  docker build -t jersey-club/ms-ventas ./ms-ventas
ARG NODE_IMAGE=node:22-alpine

# ---- 1) dependencias completas (incluye las de compilación)
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- 2) compilación
FROM deps AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- 3) solo dependencias de producción
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- 4) imagen final: sin código fuente, sin devDependencies, sin .env
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production     PORT=3012
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3012
HEALTHCHECK --interval=15s --timeout=3s --start-period=25s --retries=5   CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
