# Sistema de Cuentas y Cobro

Sistema para la gestión de servicios técnicos y generación de cuentas de cobro mensuales con validaciones de negocio estrictas.

## 🚀 Inicio Rápido

### 1. Configuración
```bash
npm install
```

### 2. Variables de Entorno (.env)
Asegúrate de configurar tu archivo `.env` en la carpeta `backend`:
- `DATABASE_URL`: Conexión a PostgreSQL (Supabase).
- `JWT_SECRET`: Clave secreta para tokens.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: credenciales SMTP para enviar avisos cuando una cuenta de cobro se aprueba.
- `FRONTEND_URL`: URL pública del frontend (por ejemplo, `https://cuentas.example.com`) para construir el enlace de acceso del correo.
- `OPENAI_API_KEY`: clave del backend para extraer los datos del servicio desde las fotos que carga el técnico.
- `OPENAI_IMPORT_MODEL` (opcional): modelo de OpenAI compatible con Responses API, lectura de imágenes y salidas JSON estructuradas (por defecto `gpt-4o-mini`).

El correo se envía solo al aprobar una cuenta por primera vez. Si SMTP no está configurado o el proveedor rechaza el envío, la aprobación se conserva y el panel administrativo informa el resultado. Usa una contraseña de aplicación o credenciales SMTP dedicadas; no publiques estos valores ni los guardes en el repositorio.

Al importar un servicio desde una foto, la imagen se envía a OpenAI para extraer sus datos; ese archivo no se guarda como original. Las fotos del flujo técnico sí quedan guardadas como evidencia del servicio. Cada foto se comprime antes de enviarla y admite hasta 1 MB. Configura la clave como variable de entorno segura en Vercel y en el entorno local del backend. Nunca la incluyas en el frontend ni en el repositorio.

### 3. Ejecución
```bash
# Compilar y ejecutar en modo desarrollo
npm run start:dev
```

## 🛠️ Estado del Proyecto

### ✅ Completado
- [x] Configuración de Base de Datos (Prisma + Supabase).
- [x] Modelado de Datos (Usuarios, Roles, Servicios, Cuentas, Auditoría).
- [x] Sistema de Autenticación (JWT + Bcrypt).
- [x] Control de Acceso Basado en Roles (RBAC).

### ⏳ En Desarrollo
- [ ] Módulo de Carga de Servicios (Validación Días 1-5).
- [ ] Agrupación de Cuentas de Cobro Mensuales.
- [ ] Módulo de Aprobación Administrativa.
- [ ] Generación de PDF de Cuenta de Cobro.

## 🔑 Credenciales de Prueba (Seed)
Para cargar usuarios de prueba, accede a: `GET http://localhost:3000/seed`

- **Admin**: `admin` / `password123`
- **Técnico**: `tecnico1` / `password123`
