import { apiFetch } from '../lib/api';

export interface ServiceApi {
  id: string;
  cuenta_cobro_id: string;
  tipo_servicio_id: string;
  tipo_servicio_nombre?: string | null;
  numero_orden: string;
  descripcion_especifica?: string | null;
  fotos?: string[];
  valor_cobrado: number;
  estado: string;
  ultima_observacion?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface TipoServicioApi {
  id: string;
  nombre: string;
  descripcion?: string | null;
  valor_estandar: number;
  activo?: boolean | null;
}

export interface CuentaApi {
  id: string;
  usuario_id: string;
  tecnico?: string | null;
  mes: number;
  anio: number;
  estado?: string | null;
  radicada: boolean;
  fecha_creacion?: string | null;
  fecha_aprobacion?: string | null;
  total: number;
  total_servicios: number;
  servicios: ServiceApi[];
}

export interface PeriodoApi {
  mes: number;
  anio: number;
}

export interface MyAccountResponse {
  periodo: PeriodoApi;
  cuenta: CuentaApi | null;
  ventanaAbierta?: boolean;
  tieneExcepcion?: boolean;
  excepcion?: {
    id: string;
    fecha_vencimiento: string;
    motivo: string | null;
  } | null;
  puedeEditar?: boolean;
}

export type EstadoServicio = 'Pendiente' | 'Aprobado' | 'Observado' | 'Rechazado';

export type CreateServicePayload = {
  tipo_servicio_id: string;
  numero_orden: string;
  descripcion_especifica?: string;
  fotos?: string[];
  fotos_puertas?: string[];
  fotos_ayudante?: string[];
  puertas_desmontadas?: number;
  requiere_ayudante?: boolean;
  motivo_ayudante?: string;
};

export type CreateTransferPayload = {
  tipo_servicio_id: string;
  numero_orden: string;
  descripcion_especifica?: string;
  destino: string;
  transporte: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA';
  valor_cobrado?: number;
};

export function asEstadoServicio(value: string): EstadoServicio {
  return value as EstadoServicio;
}

export interface EstadoBadgeData {
  estado: EstadoServicio;
  label: string;
  color: string;
  bg: string;
}

export const technicianApi = {
  getTypes: () => apiFetch<TipoServicioApi[]>('/services/types'),

  getMyAccount: () => apiFetch<MyAccountResponse>('/services/my-account'),

  getMyAccounts: () => apiFetch<CuentaApi[]>('/services/my-accounts'),

  createService: (payload: CreateServicePayload) => apiFetch<ServiceApi>('/services', {
    method: 'POST',
    body: payload,
  }),

  createTransfer: (payload: CreateTransferPayload) => apiFetch<{
    servicio: ServiceApi;
    valor_cobrado: number;
  }>('/services/transfer', {
    method: 'POST',
    body: payload,
  }),

  quoteTransfer: (payload: Omit<CreateTransferPayload, 'descripcion_especifica'>) => apiFetch<{ valor_cobrado: number }>('/services/transfer/quote', {
    method: 'POST',
    body: payload,
  }),

  updateService: (id: string, payload: {
    numero_orden?: string;
    descripcion_especifica?: string;
  }) => apiFetch<ServiceApi>(`/services/${id}`, {
    method: 'PATCH',
    body: payload,
  }),

  deleteService: (id: string) => apiFetch<{ deleted: boolean; cuentaEliminada: boolean }>(`/services/${id}`, {
    method: 'DELETE',
  }),

  radicar: () =>
    apiFetch<{
      id: string;
      mes: number;
      anio: number;
      estado: string;
      radicada: boolean;
    }>('/services/my-account/radicar', { method: 'POST' }),
};
