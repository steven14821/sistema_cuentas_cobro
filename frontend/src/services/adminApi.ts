import { useState, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import type { EstadoServicio } from './technicianApi';

const BASE = '/admin';

// ---- Tipos ----

export type UserRow = {
  id: string;
  username: string;
  nombre_completo: string;
  email: string;
  rol: 'Tecnico' | 'Admin';
  sede?: string | null;
  activo: boolean;
  motivo_inactivacion?: string | null;
  created_at: string;
};

export type PendingService = {
  id: string;
  cuenta_cobro_id: string;
  tipo_servicio_id: string;
  tipo_servicio_nombre: string | null;
  numero_orden: string;
  descripcion_especifica: string | null;
  valor_cobrado: number;
  estado: EstadoServicio;
  created_at: string;
  tecnico: string | null;
  mes: number | null;
  anio: number | null;
};

export type AccountService = {
  id: string;
  tipo_servicio_id: string;
  tipo_servicio_nombre: string | null;
  numero_orden: string;
  descripcion_especifica: string | null;
  fotos?: string[];
  valor_cobrado: number;
  estado: EstadoServicio;
  created_at?: string;
  auditoria?: {
    id: string;
    estado_anterior: EstadoServicio | null;
    estado_nuevo: EstadoServicio;
    observacion: string | null;
    fecha_accion: string | null;
    admin: string | null;
  }[];
};

export type Account = {
  id: string;
  usuario_id: string;
  tecnico: string | null;
  tecnico_email: string | null;
  tecnico_sede?: string | null;
  mes: number;
  anio: number;
  estado: EstadoServicio;
  radicada: boolean;
  fecha_creacion: string | null;
  fecha_aprobacion: string | null;
  firma_tecnico?: string | null;
  fecha_firma?: string | null;
  email_notification?: {
    status: 'sent' | 'not_configured' | 'failed';
  };
  total: number;
  total_servicios: number;
  servicios: AccountService[];
};

export type ExceptionRow = {
  id: string;
  usuario_id: string;
  tecnico: string | null;
  fecha_vencimiento: string;
  motivo: string | null;
  created_at: string | null;
};

export type DashboardSummary = {
  cuentas: {
    total: number;
    pendientes: number;
    aprobadas: number;
    observadas: number;
    rechazadas: number;
  };
  valores: {
    radicado: number;
    aprobado: number;
    pendiente: number;
  };
  servicios: {
    total: number;
    pendientes: number;
  };
  tecnicos: {
    total: number;
    activos: number;
  };
  recientes: Account[];
};

// ---- Gestión de usuarios (hook existente) ----

export function useUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<UserRow[]>(`${BASE}/users`);
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (payload: {
      username: string;
      nombre_completo: string;
      email: string;
      password: string;
      rol: 'Tecnico' | 'Admin';
      sede?: string;
      generate_password?: boolean;
    }) => {
      try {
        const result = await apiFetch<{ user: UserRow; generatedPassword?: string }>(`${BASE}/users`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setUsers((prev) => [...prev, result.user]);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo crear el usuario.';
        setCreateError(message);
        throw err;
      }
    },
    [],
  );

  const updateRole = useCallback(
    async (id: string, rol: 'Tecnico' | 'Admin') => {
      const updated = await apiFetch<UserRow>(`${BASE}/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ rol }),
      });
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      return updated;
    },
    [],
  );

  const toggleActive = useCallback(async (id: string, reason?: string) => {
    const updated = await apiFetch<UserRow>(`${BASE}/users/${id}/toggle-active`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    return updated;
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    await apiFetch<{ success: boolean; message: string }>(`${BASE}/users/${id}`, {
      method: 'DELETE',
    });
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

  return {
    users,
    loading,
    error,
    createError,
    load,
    create,
    updateRole,
    toggleActive,
    deleteUser,
  };
}

// ---- Revisión de servicios, cuentas y excepciones ----

export const reviewApi = {
  getDashboard: () => apiFetch<DashboardSummary>(`${BASE}/dashboard`),

  getPendingServices: () => apiFetch<PendingService[]>(`${BASE}/pending-services`),

  updateServiceStatus: (
    id: string,
    status: EstadoServicio,
    observacion?: string,
  ) =>
    apiFetch<AccountService & {
      email_notification?: { status: 'sent' | 'not_configured' | 'failed' };
    }>(
      `${BASE}/services/${id}/status`,
      { method: 'PATCH', body: JSON.stringify({ status, observacion }) },
    ),

  updateServiceType: (id: string, tipo_servicio_id: string) =>
    apiFetch<AccountService>(`${BASE}/services/${id}/type`, {
      method: 'PATCH',
      body: JSON.stringify({ tipo_servicio_id }),
    }),

  getAccounts: (params?: { mes?: number; anio?: number; estado?: EstadoServicio; usuario_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.mes) qs.set('mes', String(params.mes));
    if (params?.anio) qs.set('anio', String(params.anio));
    if (params?.estado) qs.set('estado', params.estado);
    if (params?.usuario_id) qs.set('usuario_id', params.usuario_id);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch<Account[]>(`${BASE}/accounts${suffix}`);
  },

  getAccountById: (id: string) => apiFetch<Account>(`${BASE}/accounts/${id}`),

  updateAccountStatus: (
    id: string,
    status: EstadoServicio,
    observacion?: string,
  ) =>
    apiFetch<Account>(`${BASE}/accounts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, observacion }),
    }),

  getExceptions: () => apiFetch<ExceptionRow[]>(`${BASE}/exceptions`),

  createException: (payload: {
    usuario_id: string;
    fecha_vencimiento: string;
    motivo?: string;
  }) =>
    apiFetch<ExceptionRow>(`${BASE}/exceptions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getUser: (id: string) => apiFetch<UserRow>(`${BASE}/users/${id}`),

  updateUser: (id: string, payload: { username: string; nombre_completo: string; email: string; sede?: string | null }) =>
    apiFetch<UserRow>(`${BASE}/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  resetUserPassword: (id: string) =>
    apiFetch<{ password: string }>(`${BASE}/users/${id}/reset-password`, { method: 'POST' }),

  updateUserPassword: (id: string, password: string) =>
    apiFetch<{ success: boolean }>(`${BASE}/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    }),

  toggleUserActive: (id: string, reason?: string) =>
    apiFetch<UserRow>(`${BASE}/users/${id}/toggle-active`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  updateUserRole: (id: string, rol: 'Tecnico' | 'Admin') =>
    apiFetch<UserRow>(`${BASE}/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ rol }),
    }),
};
