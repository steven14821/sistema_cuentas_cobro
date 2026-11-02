import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { MainLayout } from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import {
  technicianApi,
  type CuentaApi,
  type TipoServicioApi,
  type EstadoServicio,
  type ServiceApi,
} from '../services/technicianApi';
import { EstadoBadge, estadoBadgeStyle } from '../components/EstadoBadge';
import {
  formatCOP,
  getColombiaToday,
  getPeriodoARadicar,
  isVentanaAbierta,
  nombreMes,
} from '../lib/period';
import { AlertTriangle, CheckCircle2, Edit2, Plus, RotateCw, Send, Trash2, Truck, Wifi, WifiOff } from 'lucide-react';
import { RegistroFlujoModal } from '../components/RegistroFlujoModal';
import {
  enqueueOperation,
  getCachedValue,
  getPendingOperations,
  removePendingOperation,
  setCachedValue,
  QueuedOfflineError,
  type PendingOperation,
} from '../lib/offlineStore';

// Función para extraer únicamente el número de orden limpio para el técnico
export function getNumeroOrdenLimpio(numeroOrden: string): string {
  return numeroOrden.replace(/^(T-)?(BUC|CUC)-/i, '').trim();
}

function puedeFirmarCuenta(cuenta: CuentaApi): boolean {
  return cuenta.radicada
    && cuenta.estado === 'Aprobado'
    && cuenta.servicios.length > 0
    && cuenta.servicios.every((servicio) => servicio.estado === 'Aprobado');
}

interface OrdenAgrupada {
  numeroOrden: string; // Ej: "12345"
  servicioPrincipal: ServiceApi;
  traslado?: ServiceApi;
  servicioObservado?: ServiceApi;
  totalValor: number;
  estado: string;
}

export const TechnicianPortal = () => {
  const { user } = useAuth();

  // Período de carga vigente (días 1-5: mes anterior; resto: mes en curso) y ventana (UTC-5).
  const hoy = getColombiaToday();
  const [periodo, setPeriodo] = useState(() => getPeriodoARadicar(hoy));

  const [accountMeta, setAccountMeta] = useState<{
    ventanaAbierta: boolean;
    tieneExcepcion: boolean;
    excepcion: { id: string; fecha_vencimiento: string; motivo: string | null } | null;
    puedeEditar: boolean;
  }>({
    ventanaAbierta: isVentanaAbierta(hoy.dia),
    tieneExcepcion: false,
    excepcion: null,
    puedeEditar: isVentanaAbierta(hoy.dia),
  });

  const [tipos, setTipos] = useState<TipoServicioApi[]>([]);
  const [tiposStale, setTiposStale] = useState(true);
  const [cuenta, setCuenta] = useState<CuentaApi | null>(null);
  const [historial, setHistorial] = useState<CuentaApi[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [radicando, setRadicando] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const queueSyncLock = useRef(false);
  const [editingService, setEditingService] = useState<ServiceApi | null>(null);
  const [correctionOrder, setCorrectionOrder] = useState('');
  const [correctionDescription, setCorrectionDescription] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [signatureAccount, setSignatureAccount] = useState<CuentaApi | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);

  const isNetworkFailure = (err: unknown) =>
    err instanceof TypeError || !navigator.onLine ||
    /failed to fetch|network error|fetch failed/i.test(err instanceof Error ? err.message : '');

  // ---- Carga de datos ----

  const loadAccount = useCallback(async () => {
    let res: Awaited<ReturnType<typeof technicianApi.getMyAccount>>;
    try {
      res = await technicianApi.getMyAccount();
      if (user?.id) await setCachedValue(`account:${user.id}`, res);
    } catch (err) {
      if (!isNetworkFailure(err) || !user?.id) throw err;
      const cached = await getCachedValue<Awaited<ReturnType<typeof technicianApi.getMyAccount>>>(`account:${user.id}`);
      if (!cached) throw new Error('No hay una cuenta guardada para consultar sin conexión.');
      res = cached;
    }
    setPeriodo(res.periodo);
    setCuenta(res.cuenta);
    setAccountMeta({
      ventanaAbierta: res.ventanaAbierta ?? isVentanaAbierta(hoy.dia),
      tieneExcepcion: !!res.tieneExcepcion,
      excepcion: res.excepcion ?? null,
      puedeEditar: res.puedeEditar ?? ((res.ventanaAbierta || !!res.tieneExcepcion) && !res.cuenta?.radicada),
    });
    return res;
  }, [hoy.dia, user?.id]);

  const loadHistory = useCallback(async () => {
    let cuentas: CuentaApi[];
    try {
      cuentas = await technicianApi.getMyAccounts();
      if (user?.id) await setCachedValue(`history:${user.id}`, cuentas);
    } catch (err) {
      if (!isNetworkFailure(err) || !user?.id) throw err;
      const cached = await getCachedValue<CuentaApi[]>(`history:${user.id}`);
      if (!cached) throw new Error('No hay historial guardado para consultar sin conexión.');
      cuentas = cached;
    }
    setHistorial(cuentas);
  }, [user?.id]);

  const refreshPendingOperations = useCallback(async () => {
    if (!user?.id) return;
    setPendingOperations(await getPendingOperations(user.id));
  }, [user?.id]);

  const syncPendingOperations = useCallback(async () => {
    if (!user?.id || !navigator.onLine || queueSyncLock.current) return;
    queueSyncLock.current = true;
    setSyncingQueue(true);
    try {
      const operations = await getPendingOperations(user.id);
      setPendingOperations(operations);
      let changedServer = false;
      for (const operation of operations) {
        if (operation.status === 'failed') continue;
        try {
          const current = await technicianApi.getMyAccount();
          const services = current.cuenta?.servicios ?? [];
          if (operation.kind === 'service' && operation.servicePayload) {
            const payload = operation.servicePayload;
            const order = getNumeroOrdenLimpio(payload.numero_orden);
            const details: string[] = [];
            if (payload.puertas_desmontadas) {
              details.push(`Puertas desmontadas: ${payload.puertas_desmontadas} (fotos: ${payload.fotos_puertas?.length ?? 0})`);
            }
            if (payload.requiere_ayudante) {
              details.push(`Ayudante: sí (motivo: ${payload.motivo_ayudante?.trim()}, fotos del motivo: ${payload.fotos_ayudante?.length ?? 0})`);
            }
            const expectedDescription = [
              payload.descripcion_especifica?.trim(),
              details.length ? `Recolección: ${details.join(', ')}` : null,
            ].filter(Boolean).join(' | ') || null;
            const existing = services.find((service) => getNumeroOrdenLimpio(service.numero_orden) === order && !service.numero_orden.startsWith('T-'));
            if (existing) {
              changedServer = true;
              if (existing.tipo_servicio_id !== payload.tipo_servicio_id || existing.descripcion_especifica !== expectedDescription) {
                throw new Error(`La orden ${order} ya existe con datos diferentes. Verifícala antes de sincronizar.`);
              }
            } else {
              await technicianApi.createService(payload);
              changedServer = true;
            }
          } else if (operation.kind === 'transfer' && operation.transferPayload) {
            const payload = operation.transferPayload;
            const order = getNumeroOrdenLimpio(payload.numero_orden);
            const existing = services.find((service) => getNumeroOrdenLimpio(service.numero_orden) === order && service.numero_orden.startsWith('T-'));
            if (existing) {
              changedServer = true;
              if (existing.tipo_servicio_id !== payload.tipo_servicio_id || existing.descripcion_especifica !== payload.descripcion_especifica) {
                throw new Error(`El traslado de la orden ${order} ya existe con datos diferentes. Revisa la cuenta.`);
              }
            } else {
              await technicianApi.createTransfer(payload);
              changedServer = true;
            }
          } else {
            throw new Error('La operación local está incompleta y no puede sincronizarse.');
          }
          await removePendingOperation(operation.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'No se pudo sincronizar esta operación.';
          const isNetworkError = !navigator.onLine || err instanceof TypeError || /failed to fetch|network error|fetch failed/i.test(message);
          if (isNetworkError) break;
          const failedOperation = { ...operation, status: 'failed' as const, error: message };
          await enqueueOperation(failedOperation);
        }
        setPendingOperations(await getPendingOperations(user.id));
      }
      if (changedServer) await Promise.all([loadAccount(), loadHistory()]);
    } finally {
      queueSyncLock.current = false;
      setSyncingQueue(false);
      await refreshPendingOperations().catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'No se pudo actualizar la cola local.');
      });
    }
  }, [user?.id, loadAccount, loadHistory, refreshPendingOperations]);

  const queueOperation = useCallback(async (
    kind: PendingOperation['kind'],
    payload: NonNullable<PendingOperation['servicePayload']> | NonNullable<PendingOperation['transferPayload']>,
  ) => {
    if (!user?.id) throw new Error('No se pudo identificar tu usuario para guardar la operación.');
    const operation: PendingOperation = {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: user.id,
      createdAt: new Date().toISOString(),
      kind,
      ...(kind === 'service'
        ? { servicePayload: payload as NonNullable<PendingOperation['servicePayload']> }
        : { transferPayload: payload as NonNullable<PendingOperation['transferPayload']> }),
      status: 'pending',
    };
    await enqueueOperation(operation);
    await refreshPendingOperations().catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'La operación quedó guardada, pero no se pudo actualizar su estado.');
    });
    throw new QueuedOfflineError();
  }, [user?.id, refreshPendingOperations]);

  const retryPendingOperation = useCallback(async (operation: PendingOperation) => {
    try {
      const { error: _error, ...retry } = operation;
      await enqueueOperation({ ...retry, status: 'pending' });
      await refreshPendingOperations();
      void syncPendingOperations();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo reintentar la operación.');
    }
  }, [refreshPendingOperations, syncPendingOperations]);

  const discardPendingOperation = useCallback(async (operation: PendingOperation) => {
    const order = operation.servicePayload?.numero_orden ?? operation.transferPayload?.numero_orden ?? 'sin número';
    if (!window.confirm(`¿Quitar de la cola la operación de la orden ${getNumeroOrdenLimpio(order)}? Esto no borra registros que ya estén en el servidor.`)) return;
    try {
      await removePendingOperation(operation.id);
      await refreshPendingOperations();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo quitar la operación de la cola.');
    }
  }, [refreshPendingOperations]);

  const createServiceWithOfflineSupport = useCallback(async (payload: NonNullable<PendingOperation['servicePayload']>) => {
    if (!navigator.onLine) return queueOperation('service', payload);
    try {
      return await technicianApi.createService(payload);
    } catch (err) {
      if (err instanceof TypeError || /failed to fetch|network error|fetch failed/i.test(err instanceof Error ? err.message : '')) {
        return queueOperation('service', payload);
      }
      throw err;
    }
  }, [queueOperation]);

  const createTransferWithOfflineSupport = useCallback(async (payload: NonNullable<PendingOperation['transferPayload']>) => {
    if (!navigator.onLine) return queueOperation('transfer', payload);
    try {
      const response = await technicianApi.createTransfer(payload);
      return { servicio: response.servicio, valor_cobrado: response.valor_cobrado };
    } catch (err) {
      if (err instanceof TypeError || /failed to fetch|network error|fetch failed/i.test(err instanceof Error ? err.message : '')) {
        return queueOperation('transfer', payload);
      }
      throw err;
    }
  }, [queueOperation]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      let typesRes: TipoServicioApi[];
      try {
        typesRes = await technicianApi.getTypes();
        if (user?.id) await setCachedValue(`types:${user.id}`, typesRes);
      } catch (err) {
        if (!isNetworkFailure(err) || !user?.id) throw err;
        const cached = await getCachedValue<TipoServicioApi[]>(`types:${user.id}`);
        if (!cached) throw new Error('No hay tipos de servicio guardados para registrar sin conexión.');
        typesRes = cached;
      }
      await Promise.all([
        loadAccount(),
        loadHistory(),
      ]);
      setTipos(typesRes);
      setTiposStale(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, [loadAccount, loadHistory, user?.id]);

  const refreshTiposIfStale = useCallback(async () => {
    if (!tiposStale) return;
    try {
      const fresh = await technicianApi.getTypes();
      setTipos(fresh);
      setTiposStale(false);
    } catch {}
  }, [tiposStale]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const refreshAccounts = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      void Promise.all([loadAccount(), loadHistory()]).catch((err) => {
        if (!isNetworkFailure(err)) {
          setLoadError(err instanceof Error ? err.message : 'No se pudo actualizar el estado de la cuenta.');
        }
      });
    };
    const intervalId = window.setInterval(refreshAccounts, 30_000);
    window.addEventListener('focus', refreshAccounts);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshAccounts);
    };
  }, [loadAccount, loadHistory]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void syncPendingOperations();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void refreshPendingOperations().then(() => {
      if (navigator.onLine) void syncPendingOperations();
    }).catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'No se pudo leer la cola local.');
    });
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshPendingOperations, syncPendingOperations]);

  // ---- Derivados ----

  const servicios = cuenta?.servicios ?? [];
  const radicada = cuenta?.radicada ?? false;
  const puedeEditar =
    (accountMeta.puedeEditar || accountMeta.ventanaAbierta || accountMeta.tieneExcepcion) &&
    !radicada;
  const totalCuenta = cuenta?.total ?? 0;

  // Agrupar servicios por número de orden para el técnico:
  // Si una orden tiene traslado, se unifica en una sola fila con el precio total sumado
  const ordenesAgrupadas = useMemo<OrdenAgrupada[]>(() => {
    const grupos: Record<string, OrdenAgrupada> = {};

    for (const s of servicios) {
      const cleanNum = getNumeroOrdenLimpio(s.numero_orden);
      const isTraslado = s.numero_orden.startsWith('T-');

      if (!grupos[cleanNum]) {
        grupos[cleanNum] = {
          numeroOrden: cleanNum,
          servicioPrincipal: s,
          totalValor: Number(s.valor_cobrado),
          estado: s.estado,
        };
      } else {
        if (isTraslado) {
          grupos[cleanNum].traslado = s;
          grupos[cleanNum].totalValor += Number(s.valor_cobrado);
        } else {
          grupos[cleanNum].servicioPrincipal = s;
          grupos[cleanNum].totalValor += Number(s.valor_cobrado);
        }
      }

      if (['Observado', 'Rechazado'].includes(s.estado)) {
        grupos[cleanNum].servicioObservado = s;
      }

      if (isTraslado && grupos[cleanNum].servicioPrincipal === s) {
        grupos[cleanNum].traslado = s;
      }
    }

    return Object.values(grupos);
  }, [servicios]);

  // El historial no repite el período actual
  const historialOtros = historial.filter(
    (c) => !(c.mes === periodo.mes && c.anio === periodo.anio),
  );
  const ordenesRecientes = useMemo(() => {
    const allServices = [
      ...(cuenta?.servicios ?? []),
      ...historial.flatMap((entry) => entry.servicios ?? []),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const seen = new Set<string>();
    return allServices.flatMap((service) => {
      const clean = getNumeroOrdenLimpio(service.numero_orden);
      if (seen.has(clean)) return [];
      seen.add(clean);
      return [clean];
    }).slice(0, 8);
  }, [cuenta, historial]);
  const ordenesExistentes = useMemo(
    () => [...new Set(servicios.filter((service) => !service.numero_orden.startsWith('T-')).map((service) => getNumeroOrdenLimpio(service.numero_orden)))],
    [servicios],
  );

  // ---- PDF ----

  const handleDescargarActual = async () => {
    const { downloadCuentaPdf } = await import('../lib/pdf');
    downloadCuentaPdf({
      mes: periodo.mes,
      anio: periodo.anio,
      tecnico: user?.name ?? 'Técnico',
      estado: radicada ? (cuenta?.estado ?? 'Pendiente') : 'Borrador',
      firmaTecnico: cuenta?.firma_tecnico,
      fechaFirma: cuenta?.fecha_firma,
      servicios: ordenesAgrupadas.map((o) => ({
        orden: o.numeroOrden,
        tipo: o.servicioPrincipal.tipo_servicio_nombre ?? '—',
        descripcion: [
          o.servicioPrincipal.descripcion_especifica,
          o.traslado ? `Traslado: ${o.traslado.descripcion_especifica || 'Sí'}` : null,
        ].filter(Boolean).join(' · '),
        valor: o.totalValor,
      })),
    });
  };

  const handleDescargarHistorial = async (c: CuentaApi) => {
    const { downloadCuentaPdf } = await import('../lib/pdf');
    // Si viene con servicios, agruparlos también
    const ordenesH: Record<string, { orden: string; tipo: string; desc: string[]; valor: number }> = {};
    for (const s of c.servicios) {
      const clean = getNumeroOrdenLimpio(s.numero_orden);
      const isTraslado = s.numero_orden.startsWith('T-');
      if (!ordenesH[clean]) {
        ordenesH[clean] = {
          orden: clean,
          tipo: isTraslado ? 'Traslado' : (s.tipo_servicio_nombre ?? '—'),
          desc: [isTraslado ? `Traslado: ${s.descripcion_especifica || 'Sí'}` : s.descripcion_especifica].filter(Boolean) as string[],
          valor: Number(s.valor_cobrado),
        };
      } else {
        if (!isTraslado) ordenesH[clean].tipo = s.tipo_servicio_nombre ?? '—';
        ordenesH[clean].valor += Number(s.valor_cobrado);
        if (s.descripcion_especifica) {
          ordenesH[clean].desc.push(isTraslado ? `Traslado: ${s.descripcion_especifica}` : s.descripcion_especifica);
        }
      }
    }

    downloadCuentaPdf({
      mes: c.mes,
      anio: c.anio,
      tecnico: c.tecnico ?? user?.name ?? 'Técnico',
      estado: c.estado,
      firmaTecnico: c.firma_tecnico,
      fechaFirma: c.fecha_firma,
      servicios: Object.values(ordenesH).map((o) => ({
        orden: o.orden,
        tipo: o.tipo,
        descripcion: o.desc.join(' · '),
        valor: o.valor,
      })),
    });
  };

  // ---- Acciones ----

  const closeModal = () => {
    setShowModal(false);
    if (navigator.onLine) {
      loadAccount().catch((err) => setLoadError(err instanceof Error ? err.message : 'No se pudo actualizar la cuenta.'));
    }
  };

  const handleEliminarOrden = async (grupo: OrdenAgrupada) => {
    try {
      const promises: Promise<any>[] = [
        technicianApi.deleteService(grupo.servicioPrincipal.id),
      ];
      if (grupo.traslado && grupo.traslado.id !== grupo.servicioPrincipal.id) {
        promises.push(technicianApi.deleteService(grupo.traslado.id));
      }
      await Promise.all(promises);
      await loadAccount();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo eliminar la orden.');
    }
  };

  const handleRadicar = async () => {
    setRadicando(true);
    setLoadError('');
    try {
      await technicianApi.radicar();
      await Promise.all([loadAccount(), loadHistory()]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo radicar la cuenta.');
    } finally {
      setRadicando(false);
    }
  };

  const handleSaveSignature = async (firma: string) => {
    if (!signatureAccount) return;
    setSavingSignature(true);
    setLoadError('');
    try {
      await technicianApi.signAccount(signatureAccount.id, firma);
      await Promise.all([loadAccount(), loadHistory()]);
      setSignatureAccount(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo guardar la firma.');
    } finally {
      setSavingSignature(false);
    }
  };

  const startCorrection = (service: ServiceApi) => {
    setEditingService(service);
    setCorrectionOrder(getNumeroOrdenLimpio(service.numero_orden));
    setCorrectionDescription(service.descripcion_especifica ?? '');
  };

  const handleSaveCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingService) return;
    const order = correctionOrder.replace(/\D/g, '');
    if (!/^\d{5}$/.test(order)) {
      setLoadError('El número de orden debe contener exactamente 5 dígitos.');
      return;
    }
    if (!correctionDescription.trim()) {
      setLoadError('La descripción de la orden es obligatoria.');
      return;
    }
    setSavingCorrection(true);
    setLoadError('');
    try {
      await technicianApi.updateService(editingService.id, {
        numero_orden: order,
        descripcion_especifica: correctionDescription.trim(),
      });
      setEditingService(null);
      await Promise.all([loadAccount(), loadHistory()]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No se pudo enviar la corrección.');
    } finally {
      setSavingCorrection(false);
    }
  };

  return (
    <MainLayout>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '32px',
          gap: '16px',
          flexWrap: 'wrap'
        }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(26px, 5vw, 34px)', fontWeight: '700', letterSpacing: '-0.03em', margin: 0 }}>
              Mi Cuenta de Cobro
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '17px', margin: '4px 0 0 0' }}>
              Período: {nombreMes(periodo.mes)} {periodo.anio} — {user?.name ?? 'Técnico'}.
            </p>
          </div>

          {puedeEditar ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {accountMeta.tieneExcepcion && accountMeta.excepcion && (
                <div
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#e6f4ea',
                    color: '#137333',
                    fontSize: '13px',
                    fontWeight: '600',
                    border: '1px solid #ceead6',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>Excepción activa hasta {accountMeta.excepcion.fecha_vencimiento.slice(0, 10)}</span>
                </div>
              )}
              <button
                onClick={() => {
                  setShowModal(true);
                  refreshTiposIfStale();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'var(--blue)',
                  color: 'white',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: '14px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(0, 113, 227, 0.25)',
                  transition: 'transform 0.15s ease, background-color 0.15s ease'
                }}
              >
                <Plus size={18} />
                Agregar Servicio
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '12px',
              backgroundColor: cuenta?.estado === 'Aprobado' ? '#e6f4ea' : cuenta?.estado === 'Rechazado' ? '#fce8e6' : cuenta?.estado === 'Observado' ? '#fff3e0' : '#fff3cd',
              color: cuenta?.estado === 'Aprobado' ? '#137333' : cuenta?.estado === 'Rechazado' ? '#c5221f' : cuenta?.estado === 'Observado' ? '#e65100' : '#856404',
              fontSize: '14px',
              border: `1px solid ${cuenta?.estado === 'Aprobado' ? '#bbf7d0' : cuenta?.estado === 'Rechazado' ? '#fecaca' : cuenta?.estado === 'Observado' ? '#fed7aa' : '#ffeeba'}`
            }}>
              {cuenta?.estado === 'Aprobado' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <span style={{ fontWeight: 600 }}>
                {cuenta?.estado === 'Aprobado'
                  ? '¡Cuenta de cobro APROBADA! La cuenta ha sido revisada y aceptada por el administrador.'
                  : cuenta?.estado === 'Rechazado'
                  ? 'Cuenta rechazada por el administrador. Revisa las observaciones.'
                  : cuenta?.estado === 'Observado'
                  ? 'Cuenta con observaciones. Revisa los motivos indicados.'
                  : radicada
                  ? 'Esta cuenta ya fue radicada y se encuentra en revisión.'
                  : 'Carga cerrada (solo habilitada del 1 al 5 de cada mes). Solicita una excepción al administrador.'}
              </span>
            </div>
          )}
        </header>

        {cuenta && puedeFirmarCuenta(cuenta) && (
          <div className="signature-prompt" role="status">
            <div>
              <strong>{cuenta.firma_tecnico ? 'Cuenta aceptada y firmada' : 'Cuenta aceptada: falta tu firma'}</strong>
              <span>
                {cuenta.firma_tecnico
                  ? `Firma guardada${cuenta.fecha_firma ? ` el ${new Date(cuenta.fecha_firma).toLocaleDateString('es-CO')}` : ''}. El PDF ya la incluye.`
                  : 'Firma la cuenta para que tu firma quede guardada y aparezca en el PDF.'}
              </span>
            </div>
            {!cuenta.firma_tecnico && (
              <button type="button" onClick={() => setSignatureAccount(cuenta)}>
                Firmar cuenta
              </button>
            )}
          </div>
        )}

        <div className={`connection-status ${online ? 'is-online' : 'is-offline'}`} role="status">
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          <span>{online ? 'Con conexión' : 'Sin conexión'}</span>
          {pendingOperations.length > 0 && (
            <span>
              · {pendingOperations.length} {pendingOperations.length === 1 ? 'operación pendiente' : 'operaciones pendientes'}
            </span>
          )}
          {pendingOperations.length > 0 && (
            <button type="button" onClick={() => void syncPendingOperations()} disabled={!online || syncingQueue}>
              <RotateCw size={14} className={syncingQueue ? 'sync-spinning' : undefined} />
              {syncingQueue ? 'Sincronizando…' : 'Sincronizar'}
            </button>
          )}
        </div>
        {pendingOperations.some((operation) => operation.status === 'failed') && (
          <div className="queue-conflicts" role="alert">
            {pendingOperations.filter((operation) => operation.status === 'failed').map((operation) => (
              <div key={operation.id} className="queue-conflict-row">
                <p>{operation.error}</p>
                <div>
                  <button type="button" onClick={() => void retryPendingOperation(operation)}>Reintentar</button>
                  <button type="button" onClick={() => void discardPendingOperation(operation)}>Quitar</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {loadError && (
          <div style={{
            padding: '14px 18px',
            borderRadius: '14px',
            backgroundColor: '#fde8e8',
            color: '#c81e1e',
            marginBottom: '24px',
            fontSize: '14px',
            fontWeight: '500',
            border: '1px solid #f8b4b4'
          }}>
            {loadError}
          </div>
        )}

        {/* Resumen período actual */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '24px',
          padding: '28px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.05)',
          marginBottom: '32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                Cuenta del Mes
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: '700', margin: '4px 0 0 0' }}>
                {nombreMes(periodo.mes)} {periodo.anio}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <EstadoBadge estado={(cuenta?.estado ?? 'Pendiente') as EstadoServicio} />
              {servicios.length > 0 && (
                <button
                  onClick={handleDescargarActual}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(0,0,0,0.12)',
                    backgroundColor: 'white',
                    color: 'var(--ink)',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Descargar PDF
                </button>
              )}
            </div>
          </div>

          {ordenesAgrupadas.length === 0 ? (
            <div style={{
              padding: '36px 20px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '15px',
              backgroundColor: '#fafafa',
              borderRadius: '16px',
              border: '1px dashed #ddd'
            }}>
              Aún no has agregado servicios a la cuenta de {nombreMes(periodo.mes)} {periodo.anio}.
            </div>
          ) : (
            <>
              <div className="table-scroll table-wide desktop-only">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ borderBottom: '1px solid #eee' }}>
                    <tr style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      <th style={{ padding: '12px 0', fontWeight: '600' }}>Orden</th>
                      <th style={{ padding: '12px 0', fontWeight: '600' }}>Tipo de Servicio</th>
                      <th style={{ padding: '12px 0', fontWeight: '600' }}>Descripción</th>
                      <th style={{ padding: '12px 0', fontWeight: '600', textAlign: 'right' }}>Total Cobrado</th>
                      <th style={{ padding: '12px 0', fontWeight: '600', textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesAgrupadas.map((g) => (
                      <tr key={g.numeroOrden} style={{ borderBottom: '1px solid #f9f9f9' }}>
                        <td style={{ padding: '16px 0', fontSize: '15px', fontWeight: '700', color: 'var(--ink)' }}>
                          {g.numeroOrden}
                        </td>
                        <td style={{ padding: '16px 0', fontSize: '14px' }}>
                          <div style={{ fontWeight: '600', color: 'var(--ink)' }}>
                            {g.servicioPrincipal.tipo_servicio_nombre ?? 'Servicio Técnico'}
                          </div>
                          {g.traslado && (
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              marginTop: '4px',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: '#eff6ff',
                              color: '#1e40af',
                              fontSize: '12px',
                              fontWeight: '600',
                              border: '1px solid #dbeafe'
                            }}>
                              <Truck size={12} />
                              <span>Con traslado: {g.traslado.descripcion_especifica ?? 'Traslado incluido'}</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '16px 0', fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '280px' }}>
                          {g.servicioPrincipal.descripcion_especifica || '—'}
                          {g.servicioObservado?.ultima_observacion && (
                            <div style={{ marginTop: 6, color: '#b45309', fontSize: 12, fontWeight: 600 }}>
                              Observación: {g.servicioObservado.ultima_observacion}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '16px 0', fontSize: '15px', fontWeight: '700', textAlign: 'right', color: 'var(--ink)' }}>
                          {formatCOP(g.totalValor)}
                        </td>
                        <td style={{ padding: '16px 0', fontSize: '14px', textAlign: 'right' }}>
                          {puedeEditar && (
                            <button
                              onClick={() => handleEliminarOrden(g)}
                              title="Eliminar orden y su traslado"
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(211,47,47,0.3)',
                                backgroundColor: 'white',
                                color: '#d32f2f',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Trash2 size={13} />
                              Eliminar
                            </button>
                          )}
                          {g.servicioObservado && (
                            <button
                              type="button"
                              onClick={() => startCorrection(g.servicioObservado!)}
                              style={{
                                marginLeft: 6,
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid #f59e0b',
                                backgroundColor: '#fffbeb',
                                color: '#92400e',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '600',
                              }}
                            >
                              Corregir
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-only order-cards">
                {ordenesAgrupadas.map((g) => (
                  <article key={g.numeroOrden} className="order-card">
                    <div className="order-card-heading">
                      <strong>Orden {g.numeroOrden}</strong>
                      <strong>{formatCOP(g.totalValor)}</strong>
                    </div>
                    <div className="order-card-type">{g.servicioPrincipal.tipo_servicio_nombre ?? 'Servicio Técnico'}</div>
                    {g.traslado && <div className="order-card-transfer"><Truck size={14} /> {g.traslado.descripcion_especifica ?? 'Traslado incluido'}</div>}
                    <p className="order-card-description">{g.servicioPrincipal.descripcion_especifica || 'Sin descripción'}</p>
                    {g.servicioObservado?.ultima_observacion && (
                      <p className="order-card-observation"><strong>Observación:</strong> {g.servicioObservado.ultima_observacion}</p>
                    )}
                    <div className="order-card-actions">
                      {puedeEditar && (
                        <button type="button" onClick={() => handleEliminarOrden(g)} className="order-card-delete">
                          <Trash2 size={14} /> Eliminar
                        </button>
                      )}
                      {g.servicioObservado && (
                        <button type="button" onClick={() => startCorrection(g.servicioObservado!)} className="order-card-correct">
                          <Edit2 size={14} /> Corregir y reenviar
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #eee'
              }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {ordenesAgrupadas.length} orden{ordenesAgrupadas.length !== 1 ? 'es' : ''} registrada{ordenesAgrupadas.length !== 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-secondary)' }}>Total del período:</span>
                  <span style={{ fontSize: '22px', fontWeight: '800', color: 'var(--blue)' }}>{formatCOP(totalCuenta)}</span>
                </div>
              </div>

              {puedeEditar && (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={handleRadicar}
                    disabled={radicando || servicios.length === 0}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#137333',
                      color: 'white',
                      border: 'none',
                      padding: '12px 24px',
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: '700',
                      cursor: radicando || servicios.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: radicando || servicios.length === 0 ? 0.6 : 1,
                      boxShadow: '0 4px 12px rgba(19, 115, 51, 0.25)'
                    }}
                  >
                    <Send size={16} />
                    {radicando ? 'Radicando cuenta…' : 'Radicar Cuenta de Cobro'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Historial de Cuentas */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          border: '1px solid rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px' }}>
            Historial de Cuentas Radicadas
          </h3>
          {historialOtros.length === 0 ? (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '15px',
              backgroundColor: '#fafafa',
              borderRadius: '16px',
              border: '1px dashed #ddd'
            }}>
              Todavía no tienes cuentas radicadas en períodos anteriores.
            </div>
          ) : (
            <>
              <div className="table-scroll table-wide desktop-only">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead style={{ borderBottom: '1px solid #eee' }}>
                    <tr style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      <th style={{ padding: '16px 0', fontWeight: '500' }}>Mes</th>
                      <th style={{ padding: '16px 0', fontWeight: '500' }}>Servicios</th>
                      <th style={{ padding: '16px 0', fontWeight: '500' }}>Total</th>
                      <th style={{ padding: '16px 0', fontWeight: '500' }}>Estado</th>
                      <th style={{ padding: '16px 0', fontWeight: '500', textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialOtros.map((c) => (
                      <HistoryRow
                        key={c.id}
                        cuenta={c}
                        onDownload={handleDescargarHistorial}
                        onSign={setSignatureAccount}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mobile-only history-cards">
                {historialOtros.map((c) => (
                  <article key={c.id} className="history-card">
                    <div className="order-card-heading">
                      <strong>{nombreMes(c.mes)} {c.anio}</strong>
                      <strong>{formatCOP(c.total)}</strong>
                    </div>
                    <div className="history-card-meta">{c.total_servicios} servicios</div>
                    <EstadoBadge estado={c.estado as EstadoServicio} />
                    {puedeFirmarCuenta(c) && !c.firma_tecnico && (
                      <button type="button" onClick={() => setSignatureAccount(c)} className="signature-action">
                        Firmar cuenta
                      </button>
                    )}
                    <button type="button" onClick={() => handleDescargarHistorial(c)} className="order-card-correct">
                      Descargar PDF
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Modal de registro */}
        {showModal && (
          <RegistroFlujoModal
            open={showModal}
            onClose={closeModal}
            types={tipos}
            recentOrders={ordenesRecientes}
            existingOrders={ordenesExistentes}
            currentServices={servicios}
            onCreateService={async (payload) => {
              return createServiceWithOfflineSupport(payload);
            }}
            onCreateTransfer={async (payload) => {
              return createTransferWithOfflineSupport(payload);
            }}
            onDeleteService={(id) => technicianApi.deleteService(id)}
            onQuoteTransfer={async (payload) => {
              const resp = await technicianApi.quoteTransfer(payload);
              return Number(resp.valor_cobrado);
            }}
          />
        )}
        {editingService && (
          <div className="correction-backdrop">
            <form className="correction-modal" onSubmit={handleSaveCorrection}>
              <div className="correction-heading">
                <div>
                  <h2>Corregir orden {getNumeroOrdenLimpio(editingService.numero_orden)}</h2>
                  <p>Actualiza los datos indicados y envía el servicio a una nueva revisión.</p>
                </div>
                <button type="button" onClick={() => setEditingService(null)} aria-label="Cerrar corrección">×</button>
              </div>
              {editingService.ultima_observacion && (
                <div className="correction-observation"><strong>Observación del administrador:</strong> {editingService.ultima_observacion}</div>
              )}
              <label>
                Número de orden
                <input value={correctionOrder} onChange={(event) => setCorrectionOrder(event.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" maxLength={5} required />
              </label>
              <label>
                Descripción del servicio
                <textarea value={correctionDescription} onChange={(event) => setCorrectionDescription(event.target.value)} maxLength={2000} rows={5} required />
              </label>
              <p className="correction-help">Conserva la información de ayudante o puertas desmontadas si aparece en la descripción.</p>
              <div className="correction-actions">
                <button type="button" onClick={() => setEditingService(null)}>Cancelar</button>
                <button type="submit" disabled={savingCorrection}>{savingCorrection ? 'Enviando…' : 'Enviar a nueva revisión'}</button>
              </div>
            </form>
          </div>
        )}

        {signatureAccount && (
          <SignatureModal
            account={signatureAccount}
            saving={savingSignature}
            onClose={() => {
              if (!savingSignature) setSignatureAccount(null);
            }}
            onSave={handleSaveSignature}
          />
        )}
      </div>
    </MainLayout>
  );
};

const HistoryRow = ({
  cuenta,
  onDownload,
  onSign,
}: {
  cuenta: CuentaApi;
  onDownload: (c: CuentaApi) => void;
  onSign: (c: CuentaApi) => void;
}) => {
  return (
    <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
      <td style={{ padding: '16px 0', fontSize: '14px', fontWeight: '600' }}>
        {nombreMes(cuenta.mes)} {cuenta.anio}
      </td>
      <td style={{ padding: '16px 0', fontSize: '14px' }}>{cuenta.total_servicios} servicios</td>
      <td style={{ padding: '16px 0', fontSize: '14px', fontWeight: '700' }}>{formatCOP(cuenta.total)}</td>
      <td style={{ padding: '16px 0', fontSize: '14px' }}>
        <EstadoBadge estado={cuenta.estado as EstadoServicio} />
      </td>
      <td style={{ padding: '16px 0', fontSize: '14px', textAlign: 'right' }}>
        {puedeFirmarCuenta(cuenta) && !cuenta.firma_tecnico && (
          <button type="button" onClick={() => onSign(cuenta)} className="signature-action">
            Firmar
          </button>
        )}
        <button
          onClick={() => onDownload(cuenta)}
          style={{
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(0,0,0,0.1)',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600'
          }}
        >
          Descargar PDF
        </button>
      </td>
    </tr>
  );
};

const SignatureModal = ({
  account,
  saving,
  onClose,
  onSave,
}: {
  account: CuentaApi;
  saving: boolean;
  onClose: () => void;
  onSave: (signature: string) => Promise<void>;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasInk = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * scale);
    canvas.height = Math.round(bounds.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(scale, scale);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, bounds.width, bounds.height);
    context.strokeStyle = '#08111f';
    context.lineWidth = 2.4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }, []);

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    hasInk.current = true;
    setHasSignature(true);
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    context.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    context.stroke();
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, rect.width, rect.height);
    hasInk.current = false;
    setHasSignature(false);
  };

  return (
    <div className="signature-backdrop">
      <section className="signature-modal" role="dialog" aria-modal="true" aria-labelledby="signature-title">
        <div className="signature-modal-heading">
          <div>
            <span>Cuenta aceptada</span>
            <h2 id="signature-title">Firma de {nombreMes(account.mes)} {account.anio}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar firma">×</button>
        </div>
        <p>Traza tu firma en el recuadro. Se guardará en esta cuenta y aparecerá en el PDF.</p>
        <canvas
          ref={canvasRef}
          className="signature-canvas"
          aria-label="Espacio para dibujar la firma del técnico"
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
        />
        <div className="signature-modal-actions">
          <button type="button" onClick={clearSignature} disabled={!hasSignature || saving}>Limpiar</button>
          <button
            type="button"
            className="signature-save"
            disabled={!hasInk.current || saving}
            onClick={() => {
              const signature = canvasRef.current?.toDataURL('image/png');
              if (signature) void onSave(signature);
            }}
          >
            {saving ? 'Guardando…' : 'Guardar firma'}
          </button>
        </div>
      </section>
    </div>
  );
};
