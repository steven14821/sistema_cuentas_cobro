# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY prisma ./prisma/

# Instalar dependencias y generar cliente de Prisma
RUN npm ci
RUN npx prisma generate

# Copiar resto del código y compilar
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app
ENV PORT=80

# Copiar solo lo necesario desde el builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Exponer el puerto que usa NestJS
EXPOSE 3000

# Comando para iniciar en producción
CMD ["npm", "run", "start:prod"]
