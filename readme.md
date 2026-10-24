# Sistema de Gestión de Cuentas de Cobro y Servicios — E&M Electronic Solutions

Aplicación web para registrar, revisar y aprobar los servicios realizados por personal
técnico, y para generar las cuentas de cobro mensuales bajo reglas contables de corte
(días 1–5 de cada mes).

---

## 1. Stack real

| Capa        | Tecnología |
|-------------|------------|
| Frontend    | React 18 + Vite 5 + TypeScript, React Router v7, lucide-react, jspdf + jspdf-autotable. Estilos con CSS puro (variables CSS + estilos inline); **no usa Tailwind**. |
| Backend     | NestJS 12 (TypeScript), Prisma 6 sobre PostgreSQL (Supabase), autenticación JWT (Passport) + bcrypt, validación con class-validator. |
| Tests/Lint  | Vitest + oxlint (backend). |
| Puertos     | Backend `3000`, Frontend `5173` (CORS también permite `5174`). |

Zona horaria de negocio: **UTC-5 (Colombia)** — toda la lógica de fechas usa esta zona, no la del navegador.

---

## 2. Estructura del repositorio

```
sistema_cuentas_cobro/
├─ backend/                     API NestJS
│  ├─ prisma/schema.prisma      Modelo de datos (fuente de verdad)
│  └─ src/
│     ├─ auth/                  Login JWT + guard de roles (Tecnico/Admin)
│     ├─ services/              Portal del técnico (carga, borrador, historial, radicación)
│     │  ├─ period.util.ts      Reglas de ventana/período (UTC-5)
│     │  └─ dto/create-service.dto.ts
│     ├─ admin/                 Revisión, cuentas, usuarios, excepciones, dashboard
│     ├─ prisma/                PrismaService (conexión)
│     ├─ seed.service.ts / seed.controller.ts   Datos de prueba (GET /seed)
│     ├─ app.module.ts / main.ts
├─ frontend/                    SPA React + Vite
│  └─ src/
│     ├─ pages/                 LoginPage, TechnicianPortal, AdminReviewPage,
│     │                         dashboard/Dashboard, reports/ReportsPage
│     ├─ components/            EstadoBadge, ReviewModal, UserList,
│     │                         UserCreateModal, ExceptionModal, EmLogo
│     ├─ services/              technicianApi.ts, adminApi.ts
│     ├─ lib/                   api.ts (cliente HTTP), period.ts, pdf.ts, report.ts
│     └─ context/AuthContext.tsx
└─ src/                         OBSOLETO: tipos del prototipo Next.js, sin uso (no borrar/romper aún)
```

---

## 3. Puesta en marcha

### Requisitos
- Node.js 20+
- Una base PostgreSQL (local o Supabase)

### Backend
1. Crear `backend/.env`:
   ```
   DATABASE_URL="postgresql://usuario:clave@host:5432/basedatos"
   JWT_SECRET="una-cadena-larga-y-aleatoria"
   # PORT=3000   (opcional)
   ```
   > Si `JWT_SECRET` no está definido, el backend usa un valor por defecto inseguro
   > (ver sección 9).
2. Instalar, preparar el esquema y arrancar:
   ```
   cd backend
   npm install
   npx prisma generate
   npx prisma db push        # sincroniza el esquema con la BD
   npm run start:dev         # http://localhost:3000
   ```
3. Cargar datos de prueba (una vez):
   ```
   curl http://localhost:3000/seed
   ```

### Frontend
```
cd frontend
npm install
npm run dev                 # http://localhost:5173
```
La URL del API se configura con la variable de entorno `VITE_API_URL` (ver
`frontend/.env.example`). Si no se define, se usa `http://localhost:3000`.

### Credenciales de prueba (creadas por /seed)
| Rol      | Email           | Contraseña    |
|----------|-----------------|---------------|
| Admin    | `admin@em.com`  | `password123` |
| Técnico  | `tech@em.com`   | `password123` |

El login es **por email** (el `username` existe en la BD pero no se usa para autenticar).

---

## 4. Reglas de negocio

1. **Ventana de carga (días 1–5, UTC-5).** Solo del día 1 al 5 se pueden crear/eliminar
   servicios. A partir del día 6 la API lo bloquea (`ForbiddenException`), salvo que el
   técnico tenga una **excepción vigente**.
2. **Período a radicar** (`getPeriodoARadicar`): durante los días 1–5 se radica el mes que
   acaba de cerrar; el resto del mes se trabaja el **mes en curso**. El período se calcula
   en el servidor, nunca se confía en el cliente.
3. **Valor del servicio.** Lo define el **tipo de servicio** (`valor_estandar`). El técnico
   no ingresa valores.
4. **Número de orden.** Formato `BUC-XXXXX` o `CUC-XXXXX` (4–6 dígitos). Es único dentro de
   cada cuenta.
5. **Borrador persistente.** Los servicios se guardan en una cuenta en borrador
   (`radicada = false`) que el técnico puede editar. Si elimina el último servicio, la
   cuenta en borrador se borra automáticamente.
6. **Radicación.** Con el botón "Radicar", la cuenta pasa a `radicada = true` y queda
   **inmutable** (no admite más cambios). Debe tener al menos un servicio.
7. **Revisión del admin.** Puede aprobar/observar/rechazar tanto un **servicio individual**
   como una **cuenta completa** (que cascadea el estado a todos sus servicios). Cada cambio
   deja registro en `auditoria_servicios`.
8. **Estado de la cuenta.** Si todos los servicios de una cuenta comparten estado, ese
   estado se refleja en la cuenta (`recomputeCuentaEstado`).
9. **Excepciones.** El admin habilita una ventana extemporánea a un técnico hasta una
   `fecha_vencimiento`; mientras esté vigente, ese técnico puede cargar fuera del 1–5.
10. **Aprobación en dos niveles.** Existe revisión por servicio y por cuenta.

---

## 5. Modelo de datos (Prisma)

- **usuarios**: `id, username, password_hash, nombre_completo, email, rol (Tecnico|Admin), activo`
- **tipos_servicio**: `id, nombre, descripcion, valor_estandar, activo`
- **cuentas_cobro**: `id, usuario_id, mes, anio, estado, radicada, fecha_creacion, fecha_aprobacion` — único `(usuario_id, mes, anio)`
- **servicios**: `id, cuenta_cobro_id, tipo_servicio_id, numero_orden, descripcion_especifica, valor_cobrado, estado` — único `(cuenta_cobro_id, numero_orden)`
- **excepciones_carga**: `id, usuario_id, fecha_vencimiento, motivo, creado_por`
- **auditoria_servicios**: `id, servicio_id, usuario_admin_id, estado_anterior, estado_nuevo, observacion, fecha_accion`

Enums: `estado_servicio` = `Pendiente | Aprobado | Observado | Rechazado`; `rol_usuario` = `Tecnico | Admin`.

---

## 6. API (HTTP)

Todas las rutas requieren `Authorization: Bearer <token>` **excepto** `POST /auth/login` y `GET /seed`.

**Auth**
- `POST /auth/login` → `{ accessToken, user: { id, email, nombre_completo, rol } }`

**Seed**
- `GET /seed` → crea/actualiza los usuarios de prueba

**Técnico** (`rol: Tecnico`)
- `GET  /services/types` — catálogo de tipos activos
- `GET  /services/my-account` — `{ periodo, cuenta }` del período vigente
- `GET  /services/my-accounts` — historial de cuentas radicadas
- `POST /services` — `{ tipo_servicio_id, numero_orden, descripcion_especifica? }`
- `DELETE /services/:id`
- `POST /services/my-account/radicar`

**Admin** (`rol: Admin`)
- `GET   /admin/dashboard` — resumen (cuentas, valores, servicios, técnicos, recientes)
- `GET   /admin/pending-services`
- `PATCH /admin/services/:id/status` — `{ status, observacion? }`
- `GET   /admin/accounts?mes&anio&estado&usuario_id`
- `PATCH /admin/accounts/:id/status` — `{ status, observacion? }`
- `GET   /admin/exceptions` · `POST /admin/exceptions` — `{ usuario_id, fecha_vencimiento, motivo? }`
- `GET   /admin/users` · `POST /admin/users` — `{ username, nombre_completo, email, password, rol }`
- `PATCH /admin/users/:id/role` — `{ rol }`
- `POST  /admin/users/:id/toggle-active`

---

## 7. Frontend (rutas y UX)

| Ruta            | Rol      | Contenido |
|-----------------|----------|-----------|
| `/login`        | público  | Login por email. |
| `/technician`   | Técnico  | Cuenta del período (agregar/eliminar servicios, radicar), historial y descarga de PDF de la cuenta. |
| `/dashboard`    | Admin    | KPIs, cuentas recientes, accesos rápidos. |
| `/admin/review` | Admin    | Pestañas: Servicios pendientes · Cuentas · Usuarios · Excepciones. |
| `/reports`      | Admin    | Reportes: mensual / anual / por técnico / excepciones. Exporta **PDF** o **Excel (CSV)**. |

- Rutas protegidas por rol (`Protected` en `App.tsx`); el técnico que intenta entrar a una
  ruta admin es redirigido a `/technician`.
- Sesión en `localStorage`: `em_auth_user` y `em_auth_token`.
- Cliente HTTP centralizado en `lib/api.ts` (adjunta el token y normaliza errores).
- **PDF de cuenta de cobro** se genera en el frontend (`lib/pdf.ts`, jspdf).
  **Reportes** en `lib/report.ts` (PDF con jspdf-autotable, o CSV con BOM UTF-8 para Excel).

---

## 8. Scripts

**Backend**
```
npm run start:dev     # desarrollo (watch)
npm run build         # nest build
npm run start:prod    # node dist/main
npm test              # vitest run
npm run lint          # oxlint src/
npm run format        # prettier
```

**Frontend**
```
npm run dev           # vite
npm run build         # tsc && vite build
npm run preview
```

---

## 9. Deuda técnica y pendientes conocidos

- **`JWT_SECRET`**: ya está definido en `backend/.env`. En producción debe usarse un secreto
  propio y largo por entorno (si falta, el código cae a un valor por defecto inseguro).
- **Bundle grande (>500 kB)**: `jspdf` se importa de forma eager; conviene carga diferida
  (dynamic import) para no penalizar el arranque.
- **Observación no visible para el técnico**: cuando el admin marca un servicio/cuenta como
  `Observado` o `Rechazado`, el técnico no ve el motivo. Falta exponerlo en su portal.
- **`src/` en la raíz** es el remanente de un prototipo Next.js, sin uso.
- **CORS** limitado a `localhost`; debe configurarse para producción.
- La tabla `auditoria_servicios` se escribe pero no se expone por ningún endpoint.
```
