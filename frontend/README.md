# 📄 Sistema de Gestión de Cuentas de Cobro y Servicios - E&M Electronic Solutions

Sistema web corporativo de alta fidelidad diseñado para la gestión, registro y aprobación de servicios realizados por personal técnico, automatizando la generación de cuentas de cobro bajo un flujo de auditoría administrativa.

---

## 🎨 Identidad Visual y Diseño (Apple Ecosystem)

El sistema ha sido desarrollado bajo los principios de **Apple Human Interface Guidelines (HIG)**, priorizando la claridad, la profundidad y la respuesta inmediata.

### 💎 Pilares del Diseño:
- **Materialidad**: Uso de *Glassmorphism* (fondos traslúcidos con `backdrop-filter: blur`) para crear jerarquía visual y profundidad.
- **Geometría**: Implementación de bordes redondeados orgánicos (*Squircles*) en botones, inputs y tarjetas para una sensación moderna y fluida.
- **Tipografía**: Uso de fuentes nativas del sistema (`system-ui`) con ajustes de *tracking* negativo en títulos para lograr una estética editorial y profesional.
- **Paleta de Colores**:
  - `--blue: #0057B8` (Acciones principales y Branding)
  - `--ink: #08111F` (Títulos y textos de alta jerarquía)
  - `--gold: #F5C400` (Acentos y alertas de atención)
  - `--white: #ffffff` (Fondos limpios y contrastes)
  - `--bg-soft: #F5F5F7` (Fondo general para reducir la fatiga visual)

---

## 🛠️ Stack Tecnológico
- **Frontend**: React + Vite + TypeScript + React Router DOM.
- **Estilos**: CSS Moderno con variables globales y enfoques de diseño fluido.
- **Arquitectura**: Basada en componentes desacoplados y Layouts maestros.

---

## 🚀 Reglas de Negocio y Flujos

### 👨‍🔧 Portal del Técnico
- **Carga de Servicios**: Registro de actividades mediante número de orden (`BUC-XXXXX` o `CUC-XXXXX`).
- **Ventana Temporal (Regla 1-5)**: El sistema bloquea la carga de servicios automáticamente a partir del día 6 de cada mes.
- **Consulta**: Acceso al historial de cuentas y descarga de comprobantes en PDF.

### 👔 Panel Administrativo
- **Auditoría**: Capacidad de aprobar, observar o rechazar servicios presentados.
- **Gestión de Excepciones**: Facultad de habilitar ventanas de carga extemporáneas para técnicos específicos.
- **Reportes**: Generación de reportes globales en PDF/Excel para el cierre contable mensual.

---

## 🔒 Seguridad y Roles
- **Rol Técnico**: Acceso limitado a la carga de sus propios servicios y consulta de historial.
- **Rol Administrativo**: Acceso total al dashboard de auditoría, reportes globales y gestión de excepciones.
