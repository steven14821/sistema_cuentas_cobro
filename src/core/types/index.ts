export type RolUsuario = 'Tecnico' | 'Admin';
export type EstadoServicio = 'Pendiente' | 'Aprobado' | 'Observado' | 'Rechazado';

export interface Usuario {
  id: string;
  username: string;
  nombreCompleto: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
}

export interface TipoServicio {
  id: string;
  nombre: string;
  descripcion: string;
  valorEstandar: number;
  activo: boolean;
}

export interface CuentaCobro {
  id: string;
  usuarioId: string;
  mes: number;
  anio: number;
  estado: EstadoServicio;
  fechaCreacion: string;
  fechaAprobacion?: string;
}

export interface Servicio {
  id: string;
  cuentaCobroId: string;
  tipoServicioId: string;
  numeroOrden: string; // BUC-XXXXX o CUC-XXXXX
  descripcionEspecifica: string;
  valorCobrado: number;
  estado: EstadoServicio;
  createdAt: string;
  updatedAt: string;
}

export interface ExcepcionCarga {
  id: string;
  usuarioId: string;
  fechaVencimiento: string;
  motivo: string;
  creadoPor: string;
  createdAt: string;
}

export interface AuditoriaServicio {
  id: string;
  servicioId: string;
  usuarioAdminId: string;
  estadoAnterior: EstadoServicio;
  estadoNuevo: EstadoServicio;
  observacion: string;
  fechaAccion: string;
}
