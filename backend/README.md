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
- `OPENAI_API_KEY`: clave del backend para interpretar consultas de reportes, transcribir audios y extraer servicios de los PDF/fotos cargados.
- `OPENAI_REPORT_MODEL` (opcional): modelo de OpenAI compatible con Chat Completions y salidas JSON estructuradas (por defecto `gpt-4o-mini`).
- `OPENAI_TRANSCRIPTION_MODEL` (opcional): modelo de transcripción de audio (por defecto `gpt-4o-mini-transcribe`).
- `OPENAI_IMPORT_MODEL` (opcional): modelo de OpenAI compatible con Responses API, lectura de imágenes/PDF y salidas JSON estructuradas (por defecto `gpt-4o-mini`).

El correo se envía solo al aprobar una cuenta por primera vez. Si SMTP no está configurado o el proveedor rechaza el envío, la aprobación se conserva y el panel administrativo informa el resultado. Usa una contraseña de aplicación o credenciales SMTP dedicadas; no publiques estos valores ni los guardes en el repositorio.

El asistente envía a OpenAI el texto de la consulta y, cuando se usa voz, el audio para transcripción. Los registros consultados se agregan dentro del backend; no se incluyen en la solicitud del asistente. Al importar una cuenta, el PDF o la foto se envía a OpenAI para extraer sus datos; esos archivos no se guardan como originales. Las fotos del flujo técnico sí quedan guardadas como evidencia del servicio. El PDF admite hasta 4 MB y cada foto se comprime antes de enviarla. Configura la clave como variable de entorno segura en Vercel y en el entorno local del backend. Nunca la incluyas en el frontend ni en el repositorio.

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
