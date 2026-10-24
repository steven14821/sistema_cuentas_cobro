import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
import { AlertTriangle, CheckCircle2, Edit2, Plus, Send, Trash2, Truck } from 'lucide-react';
import { RegistroFlujoModal } from '../components/RegistroFlujoModal';

// Función para extraer únicamente el número de orden limpio para el técnico
export function getNumeroOrdenLimpio(numeroOrden: string): string {
  return numeroOrden.replace(/^(T-)?(BUC|CUC)-/i, '').trim();
}

interface OrdenAgrupada {
  numeroOrden: string; // Ej: "12345"
  servicioPrincipal: ServiceApi;
  traslado?: ServiceApi;
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

  // ---- Carga de datos ----

  const loadAccount = useCallback(async () => {
    const res = await technicianApi.getMyAccount();
    setPeriodo(res.periodo);
    setCuenta(res.cuenta);
    setAccountMeta({
      ventanaAbierta: res.ventanaAbierta ?? isVentanaAbierta(hoy.dia),
      tieneExcepcion: !!res.tieneExcepcion,
      excepcion: res.excepcion ?? null,
      puedeEditar: res.puedeEditar ?? ((res.ventanaAbierta || !!res.tieneExcepcion) && !res.cuenta?.radicada),
    });
    return res;
  }, [hoy.dia]);

  const loadHistory = useCallback(async () => {
    const cuentas = await technicianApi.getMyAccounts();
    setHistorial(cuentas);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [typesRes] = await Promise.all([
        technicianApi.getTypes(),
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
  }, [loadAccount, loadHistory]);

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

  // ---- PDF ----

  const handleDescargarActual = async () => {
    const { downloadCuentaPdf } = await import('../lib/pdf');
    downloadCuentaPdf({
      mes: periodo.mes,
      anio: periodo.anio,
      tecnico: user?.name ?? 'Técnico',
      estado: radicada ? (cuenta?.estado ?? 'Pendiente') : 'Borrador',
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
    loadAccount();
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
              <div className="table-scroll table-wide">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            <div className="table-scroll table-wide">
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
                    <HistoryRow key={c.id} cuenta={c} onDownload={handleDescargarHistorial} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de registro */}
        {showModal && (
          <RegistroFlujoModal
            open={showModal}
            onClose={closeModal}
            types={tipos}
            onCreateService={async (payload) => {
              return technicianApi.createService(payload);
            }}
            onCreateTransfer={async (payload) => {
              const resp = await technicianApi.createTransfer(payload);
              return { servicio: resp.servicio, valor_cobrado: resp.valor_cobrado };
            }}
          />
        )}
      </div>
    </MainLayout>
  );
};

const HistoryRow = ({
  cuenta,
  onDownload,
}: {
  cuenta: CuentaApi;
  onDownload: (c: CuentaApi) => void;
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
