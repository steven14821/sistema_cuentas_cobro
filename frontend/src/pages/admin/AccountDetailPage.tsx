import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '../../layouts/MainLayout';
import { reviewApi, type Account, type AccountService } from '../../services/adminApi';
import { technicianApi, type EstadoServicio, type TipoServicioApi } from '../../services/technicianApi';
import { EstadoBadge } from '../../components/EstadoBadge';
import { formatCOP, nombreMes } from '../../lib/period';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Building2,
  User,
  Mail,
  Layers,
  RefreshCw,
  Truck,
  Eye,
  Download,
  X,
  Pencil,
} from 'lucide-react';

interface OrdenAgrupadaAdmin {
  numeroOrden: string;
  servicioPrincipal: AccountService;
  traslado?: AccountService;
  totalValor: number;
  estado: EstadoServicio;
}

export const AccountDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal para detalle completo de la orden (Ojo)
  const [selectedOrder, setSelectedOrder] = useState<OrdenAgrupadaAdmin | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Modal para aprobar/observar/rechazar (servicio o cuenta)
  const [target, setTarget] = useState<{
    kind: 'service' | 'account';
    id: string;
    action: EstadoServicio;
    title: string;
    subtitle?: string;
    secondaryId?: string;
  } | null>(null);
  const [observacion, setObservacion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [serviceTypeTarget, setServiceTypeTarget] = useState<AccountService | null>(null);
  const [serviceTypes, setServiceTypes] = useState<TipoServicioApi[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [loadingServiceTypes, setLoadingServiceTypes] = useState(false);
  const [savingServiceType, setSavingServiceType] = useState(false);
  const [serviceTypeError, setServiceTypeError] = useState<string | null>(null);

  const loadAccount = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reviewApi.getAccountById(id);
      setAccount(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la cuenta de cobro.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const handleOpenAction = (
    kind: 'service' | 'account',
    targetId: string,
    action: EstadoServicio,
    title: string,
    subtitle?: string,
    secondaryId?: string,
  ) => {
    setTarget({ kind, id: targetId, action, title, subtitle, secondaryId });
    setObservacion('');
    setActionError(null);
    setActionNotice(null);
  };

  const handleSubmitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;

    setSubmitting(true);
    setActionError(null);
    try {
      let notificationStatus: 'sent' | 'not_configured' | 'failed' | undefined;
      if (target.kind === 'service') {
        const promises = [reviewApi.updateServiceStatus(target.id, target.action, observacion.trim())];
        if (target.secondaryId && target.secondaryId !== target.id) {
          promises.push(reviewApi.updateServiceStatus(target.secondaryId, target.action, observacion.trim()));
        }
        const results = await Promise.all(promises);
        notificationStatus = results.find((result) => result.email_notification)?.email_notification?.status;
      } else {
        const result = await reviewApi.updateAccountStatus(target.id, target.action, observacion.trim());
        notificationStatus = result.email_notification?.status;
      }
      setTarget(null);
      if (target.action === 'Aprobado' && notificationStatus) {
        setActionNotice(notificationStatus === 'sent'
          ? 'Cuenta aprobada y correo de aviso enviado al técnico.'
          : notificationStatus === 'not_configured'
            ? 'Cuenta aprobada. No se pudo enviar el correo: configura SMTP en el servidor.'
            : 'Cuenta aprobada, pero ocurrió un error al enviar el correo. Revisa los registros del servidor.');
      }
      await loadAccount();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Error al actualizar el estado.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenServiceType = async (service: AccountService) => {
    setServiceTypeTarget(service);
    setSelectedTypeId(service.tipo_servicio_id);
    setServiceTypeError(null);
    if (serviceTypes.length > 0) return;
    setLoadingServiceTypes(true);
    try {
      setServiceTypes(await technicianApi.getTypes());
    } catch (err) {
      setServiceTypeError(err instanceof Error ? err.message : 'No se pudieron cargar los tipos de servicio.');
    } finally {
      setLoadingServiceTypes(false);
    }
  };

  const handleSaveServiceType = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!serviceTypeTarget || !selectedTypeId) return;
    setSavingServiceType(true);
    setServiceTypeError(null);
    try {
      await reviewApi.updateServiceType(serviceTypeTarget.id, selectedTypeId);
      setServiceTypeTarget(null);
      await loadAccount();
    } catch (err) {
      setServiceTypeError(err instanceof Error ? err.message : 'No se pudo cambiar el tipo de servicio.');
    } finally {
      setSavingServiceType(false);
    }
  };

  const availableServiceTypes = serviceTypes.filter(
    (type) => !type.nombre.toUpperCase().startsWith('TRASLADO'),
  );

  const servicios = account?.servicios ?? [];

  // Agrupamos las órdenes de la misma forma que el técnico (servicio + traslado unificados)
  const ordenesAgrupadas = useMemo<OrdenAgrupadaAdmin[]>(() => {
    const grupos: Record<string, OrdenAgrupadaAdmin> = {};

    for (const s of servicios) {
      // Obtenemos el identificador limpio o con prefijo BUC/CUC
      const match = s.numero_orden.match(/^(?:T-)?((BUC|CUC)-\d{4,6}|\d{4,6})/i);
      const ordenKey = match ? match[1].toUpperCase() : s.numero_orden.replace(/^T-/i, '');
      const isTraslado = s.numero_orden.startsWith('T-');

      if (!grupos[ordenKey]) {
        grupos[ordenKey] = {
          numeroOrden: ordenKey,
          servicioPrincipal: s,
          totalValor: Number(s.valor_cobrado),
          estado: s.estado,
        };
      } else {
        if (isTraslado) {
          grupos[ordenKey].traslado = s;
          grupos[ordenKey].totalValor += Number(s.valor_cobrado);
        } else {
          grupos[ordenKey].servicioPrincipal = s;
          grupos[ordenKey].totalValor += Number(s.valor_cobrado);
        }
      }

      if (isTraslado && grupos[ordenKey].servicioPrincipal === s) {
        grupos[ordenKey].traslado = s;
      }
    }

    return Object.values(grupos);
  }, [servicios]);

  const ordenesAprobadas = ordenesAgrupadas.filter((o) => o.estado === 'Aprobado').length;
  const ordenesPendientes = ordenesAgrupadas.filter((o) => o.estado === 'Pendiente').length;
  const ordenesObservadas = ordenesAgrupadas.filter((o) => o.estado === 'Observado').length;
  const ordenesRechazadas = ordenesAgrupadas.filter((o) => o.estado === 'Rechazado').length;

  const handleDescargarPdf = async () => {
    if (!account) return;
    const { downloadCuentaPdf } = await import('../../lib/pdf');
    downloadCuentaPdf({
      mes: account.mes,
      anio: account.anio,
      tecnico: account.tecnico ?? 'Técnico',
      estado: account.estado ?? 'Pendiente',
      firmaTecnico: account.firma_tecnico,
      fechaFirma: account.fecha_firma,
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

  if (loading) {
    return (
      <MainLayout>
        <div style={{ maxWidth: '1100px', margin: '40px auto', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Cargando detalle de la cuenta de cobro…
        </div>
      </MainLayout>
    );
  }

  if (error || !account) {
    return (
      <MainLayout>
        <div style={{ maxWidth: '800px', margin: '40px auto' }}>
          <button
            type="button"
            onClick={() => navigate('/admin/review')}
            style={backBtnStyle}
          >
            <ArrowLeft size={16} /> Volver a cuentas
          </button>
          <div style={errorCardStyle}>
            <h3>Error al cargar la cuenta</h3>
            <p>{error ?? 'Cuenta no encontrada.'}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div style={{ maxWidth: '1150px', margin: '0 auto', paddingBottom: '60px' }}>
        {actionNotice && (
          <div
            role="status"
            style={{
              marginBottom: '16px',
              padding: '12px 16px',
              borderRadius: '10px',
              background: actionNotice.includes('No se pudo') || actionNotice.includes('error')
                ? '#fff7ed'
                : '#ecfdf5',
              color: actionNotice.includes('No se pudo') || actionNotice.includes('error')
                ? '#9a3412'
                : '#166534',
              fontSize: '14px',
            }}
          >
            {actionNotice}
          </div>
        )}
        {/* Barra superior de navegación */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <button
            type="button"
            onClick={() => navigate('/admin/review')}
            style={backBtnStyle}
          >
            <ArrowLeft size={16} /> Volver a Cuentas de Cobro
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleDescargarPdf}
              style={{
                ...secondaryBtnStyle,
                backgroundColor: 'var(--blue)',
                color: 'white',
                borderColor: 'transparent',
              }}
            >
              <Download size={14} /> Descargar PDF de Cuenta
            </button>

            <button
              type="button"
              onClick={loadAccount}
              style={secondaryBtnStyle}
            >
              <RefreshCw size={14} /> Actualizar
            </button>
          </div>
        </div>

        {/* Encabezado Principal de la Cuenta */}
        <div style={headerCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <h1 style={{ fontSize: 'clamp(24px, 4vw, 30px)', fontWeight: '700', margin: 0, color: 'var(--ink)' }}>
                  Cuenta {nombreMes(account.mes)} {account.anio}
                </h1>
                <EstadoBadge estado={account.estado ?? 'Pendiente'} />
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: 0 }}>
                Radicada el {account.fecha_creacion ? new Date(account.fecha_creacion).toLocaleDateString('es-CO') : '—'}
              </p>
            </div>

            {/* Total acumulado */}
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Total a Cobrar
              </span>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--blue)', letterSpacing: '-0.02em' }}>
                {formatCOP(account.total)}
              </div>
            </div>
          </div>

          {/* Tarjetas informativas del técnico */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <div style={infoBlockStyle}>
              <User size={16} style={{ color: 'var(--blue)' }} />
              <div>
                <span style={infoLabelStyle}>Técnico</span>
                <strong style={infoValueStyle}>{account.tecnico ?? 'Sin nombre'}</strong>
              </div>
            </div>

            <div style={infoBlockStyle}>
              <Mail size={16} style={{ color: 'var(--blue)' }} />
              <div>
                <span style={infoLabelStyle}>Correo</span>
                <span style={infoValueStyle}>{account.tecnico_email ?? '—'}</span>
              </div>
            </div>

            <div style={infoBlockStyle}>
              <Building2 size={16} style={{ color: account.tecnico_sede === 'Cucuta' ? '#9d174d' : '#1e40af' }} />
              <div>
                <span style={infoLabelStyle}>Sede Asignada</span>
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: '2px',
                    fontWeight: 700,
                    fontSize: '13px',
                    color: account.tecnico_sede === 'Cucuta' ? '#9d174d' : '#1e40af',
                  }}
                >
                  {account.tecnico_sede === 'Cucuta' ? 'Sede Cúcuta' : 'Sede Bucaramanga'}
                </span>
              </div>
            </div>

            <div style={infoBlockStyle}>
              <Layers size={16} style={{ color: 'var(--blue)' }} />
              <div>
                <span style={infoLabelStyle}>Progreso de Revisión</span>
                <span style={infoValueStyle}>
                  {ordenesAprobadas} de {ordenesAgrupadas.length} órdenes aprobadas
                </span>
              </div>
            </div>
          </div>

          {/* Botones de acción masiva sobre la cuenta completa */}
          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(0,0,0,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Acciones sobre la <strong>cuenta completa</strong> (aplica a todos los servicios):
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() =>
                  handleOpenAction(
                    'account',
                    account.id,
                    'Aprobado',
                    'Aprobar toda la cuenta',
                    `Se marcarán como aprobadas las ${ordenesAgrupadas.length} órdenes de la cuenta.`,
                  )
                }
                style={approveBtnStyle}
              >
                <CheckCircle2 size={15} /> Aprobar Cuenta Completa
              </button>

              <button
                type="button"
                onClick={() =>
                  handleOpenAction(
                    'account',
                    account.id,
                    'Observado',
                    'Observar cuenta',
                    'Indica las observaciones que el técnico debe subsanar.',
                  )
                }
                style={observeBtnStyle}
              >
                <AlertTriangle size={15} /> Observar
              </button>

              <button
                type="button"
                onClick={() =>
                  handleOpenAction(
                    'account',
                    account.id,
                    'Rechazado',
                    'Rechazar cuenta',
                    'Se rechazarán todos los servicios de esta cuenta.',
                  )
                }
                style={rejectBtnStyle}
              >
                <XCircle size={15} /> Rechazar
              </button>
            </div>
          </div>
        </div>

        {/* Listado de Servicios Individuales */}
        <div style={sectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: 'var(--ink)' }}>
              Órdenes Registradas ({ordenesAgrupadas.length})
            </h2>

            {/* Badges contadores */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={counterBadge('#e6f4ea', '#137333')}>Aprobados: {ordenesAprobadas}</span>
              <span style={counterBadge('#fef7e0', '#b06000')}>Pendientes: {ordenesPendientes}</span>
              {ordenesObservadas > 0 && <span style={counterBadge('#fff3e0', '#e65100')}>Observados: {ordenesObservadas}</span>}
              {ordenesRechazadas > 0 && <span style={counterBadge('#fce8e6', '#c5221f')}>Rechazados: {ordenesRechazadas}</span>}
            </div>
          </div>

          {ordenesAgrupadas.length === 0 ? (
            <div style={emptyBoxStyle}>No hay servicios registrados en esta cuenta.</div>
          ) : (
            <>
            <div className="table-scroll table-wide desktop-only">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ borderBottom: '2px solid #edf2f7' }}>
                  <tr style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    <th style={{ ...thStyle, width: '130px', minWidth: '130px' }}>Orden</th>
                    <th style={thStyle}>Tipo de Servicio</th>
                    <th style={thStyle}>Descripción</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Valor Total</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Estado</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenesAgrupadas.map((grupo) => {
                    const s = grupo.servicioPrincipal;
                    const hasTraslado = !!grupo.traslado;

                    return (
                      <tr
                        key={grupo.numeroOrden}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Número de orden con BUC/CUC completo para el admin */}
                        <td style={{ ...tdStyle, fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '5px 12px',
                              borderRadius: '8px',
                              letterSpacing: '0.04em',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                              background: grupo.numeroOrden.includes('CUC') ? '#fdf2f8' : '#eff6ff',
                              color: grupo.numeroOrden.includes('CUC') ? '#9d174d' : '#1e40af',
                              border: `1px solid ${grupo.numeroOrden.includes('CUC') ? '#fbcfe8' : '#bfdbfe'}`,
                            }}
                          >
                            {grupo.numeroOrden}
                          </span>
                        </td>

                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          <div>{s.tipo_servicio_nombre ?? '—'}</div>
                          {hasTraslado && (
                            <div style={{ marginTop: '4px' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: '#f0fdf4',
                                  color: '#166534',
                                  border: '1px solid #bbf7d0',
                                  fontWeight: 600,
                                }}
                              >
                                <Truck size={11} /> + Traslado incluido
                              </span>
                            </div>
                          )}
                        </td>

                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', maxWidth: '280px' }}>
                          <div>{s.descripcion_especifica || '—'}</div>
                          {hasTraslado && grupo.traslado?.descripcion_especifica && (
                            <div style={{ fontSize: '12px', color: '#166534', marginTop: '2px' }}>
                              <strong>Destino:</strong> {grupo.traslado.descripcion_especifica}
                            </div>
                          )}
                          {s.auditoria && s.auditoria.length > 0 && s.auditoria[0].observacion && (
                            <div style={obsNoteStyle}>
                              <strong>Última nota:</strong> {s.auditoria[0].observacion}
                            </div>
                          )}
                        </td>

                        <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'right' }}>
                          <div>{formatCOP(grupo.totalValor)}</div>
                          {hasTraslado && (
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                              Serv: {formatCOP(s.valor_cobrado)} + Trasl: {formatCOP(grupo.traslado!.valor_cobrado)}
                            </div>
                          )}
                        </td>

                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <EstadoBadge estado={grupo.estado} />
                        </td>

                        {/* Botones de acción individual por orden (aplica a servicio y traslado juntos) */}
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              title="Ver detalle completo de la orden"
                              onClick={() => setSelectedOrder(grupo)}
                              style={{
                                ...actionMiniBtn,
                                backgroundColor: '#f1f5f9',
                                color: 'var(--ink)',
                                borderColor: '#cbd5e1',
                                fontWeight: 600,
                              }}
                            >
                              <Eye size={13} /> Ver Detalle
                            </button>

                            <button
                              type="button"
                              title="Cambiar tipo de servicio"
                              onClick={() => void handleOpenServiceType(s)}
                              style={{
                                ...actionMiniBtn,
                                backgroundColor: '#f5f3ff',
                                color: '#6d28d9',
                                borderColor: '#ddd6fe',
                                fontWeight: 600,
                              }}
                            >
                              <Pencil size={13} /> Cambiar tipo
                            </button>

                            <button
                              type="button"
                              title="Aprobar orden"
                              onClick={() =>
                                handleOpenAction(
                                  'service',
                                  s.id,
                                  'Aprobado',
                                  `Aprobar ${grupo.numeroOrden}`,
                                  `${s.tipo_servicio_nombre}${hasTraslado ? ' + Traslado' : ''} · ${formatCOP(grupo.totalValor)}`,
                                  grupo.traslado?.id,
                                )
                              }
                              style={{
                                ...actionMiniBtn,
                                backgroundColor: grupo.estado === 'Aprobado' ? '#e6f4ea' : '#f0fdf4',
                                color: '#166534',
                                borderColor: '#bbf7d0',
                                fontWeight: grupo.estado === 'Aprobado' ? 700 : 500,
                              }}
                            >
                              <CheckCircle2 size={13} /> Aprobar
                            </button>

                            <button
                              type="button"
                              title="Observar orden"
                              onClick={() =>
                                handleOpenAction(
                                  'service',
                                  s.id,
                                  'Observado',
                                  `Observar ${grupo.numeroOrden}`,
                                  'Ingresa el motivo u observación para el técnico.',
                                  grupo.traslado?.id,
                                )
                              }
                              style={{
                                ...actionMiniBtn,
                                backgroundColor: grupo.estado === 'Observado' ? '#fef3c7' : '#fffbeb',
                                color: '#92400e',
                                borderColor: '#fde68a',
                                fontWeight: grupo.estado === 'Observado' ? 700 : 500,
                              }}
                            >
                              <AlertTriangle size={13} /> Observar
                            </button>

                            <button
                              type="button"
                              title="Rechazar orden"
                              onClick={() =>
                                handleOpenAction(
                                  'service',
                                  s.id,
                                  'Rechazado',
                                  `Rechazar ${grupo.numeroOrden}`,
                                  'Ingresa el motivo del rechazo.',
                                  grupo.traslado?.id,
                                )
                              }
                              style={{
                                ...actionMiniBtn,
                                backgroundColor: grupo.estado === 'Rechazado' ? '#fee2e2' : '#fef2f2',
                                color: '#991b1b',
                                borderColor: '#fecaca',
                                fontWeight: grupo.estado === 'Rechazado' ? 700 : 500,
                              }}
                            >
                              <XCircle size={13} /> Rechazar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mobile-only admin-service-cards">
              {ordenesAgrupadas.map((grupo) => {
                const s = grupo.servicioPrincipal;
                const hasTraslado = !!grupo.traslado;
                const statusColor = grupo.estado === 'Aprobado'
                  ? '#15803d'
                  : grupo.estado === 'Observado'
                    ? '#b45309'
                    : grupo.estado === 'Rechazado'
                      ? '#b91c1c'
                      : '#1d4ed8';

                return (
                  <article key={grupo.numeroOrden} className="admin-service-card" style={{ borderLeftColor: statusColor }}>
                    <div className="admin-service-card-top">
                      <span className={`admin-order-number ${grupo.numeroOrden.includes('CUC') ? 'is-cucuta' : ''}`}>
                        {grupo.numeroOrden}
                      </span>
                      <EstadoBadge estado={grupo.estado} />
                    </div>

                    <h3 className="admin-service-card-title">{s.tipo_servicio_nombre ?? 'Servicio técnico'}</h3>
                    {hasTraslado && (
                      <div className="admin-service-card-transfer">
                        <Truck size={14} />
                        <span>{grupo.traslado?.descripcion_especifica || 'Traslado incluido'}</span>
                      </div>
                    )}

                    <p className="admin-service-card-description">{s.descripcion_especifica || 'Sin descripción del servicio.'}</p>
                    {s.auditoria?.[0]?.observacion && (
                      <div className="admin-service-card-note">
                        <strong>Última nota:</strong> {s.auditoria[0].observacion}
                      </div>
                    )}

                    <div className="admin-service-card-total">
                      <span>{hasTraslado ? 'Total con traslado' : 'Valor del servicio'}</span>
                      <strong>{formatCOP(grupo.totalValor)}</strong>
                    </div>
                    {hasTraslado && (
                      <div className="admin-service-card-breakdown">
                        Servicio {formatCOP(s.valor_cobrado)} <span aria-hidden="true">·</span> Traslado {formatCOP(grupo.traslado!.valor_cobrado)}
                      </div>
                    )}

                    <div className="admin-service-card-actions">
                      <button
                        type="button"
                        className="admin-service-action detail"
                        onClick={() => setSelectedOrder(grupo)}
                      >
                        <Eye size={15} /> Ver detalle
                      </button>
                      <button
                        type="button"
                        className="admin-service-action change-type"
                        onClick={() => void handleOpenServiceType(s)}
                      >
                        <Pencil size={15} /> Cambiar tipo
                      </button>
                      <button
                        type="button"
                        className="admin-service-action approve"
                        style={grupo.estado === 'Aprobado' ? { color: statusColor, backgroundColor: '#e6f4ea', borderColor: '#bbf7d0' } : undefined}
                        onClick={() => handleOpenAction(
                          'service',
                          s.id,
                          'Aprobado',
                          `Aprobar ${grupo.numeroOrden}`,
                          `${s.tipo_servicio_nombre}${hasTraslado ? ' + Traslado' : ''} · ${formatCOP(grupo.totalValor)}`,
                          grupo.traslado?.id,
                        )}
                      >
                        <CheckCircle2 size={15} /> Aprobar
                      </button>
                      <button
                        type="button"
                        className="admin-service-action observe"
                        style={grupo.estado === 'Observado' ? { color: statusColor, backgroundColor: '#fef3c7', borderColor: '#fde68a' } : undefined}
                        onClick={() => handleOpenAction(
                          'service',
                          s.id,
                          'Observado',
                          `Observar ${grupo.numeroOrden}`,
                          'Ingresa el motivo u observación para el técnico.',
                          grupo.traslado?.id,
                        )}
                      >
                        <AlertTriangle size={15} /> Observar
                      </button>
                      <button
                        type="button"
                        className="admin-service-action reject"
                        style={grupo.estado === 'Rechazado' ? { color: statusColor, backgroundColor: '#fee2e2', borderColor: '#fecaca' } : undefined}
                        onClick={() => handleOpenAction(
                          'service',
                          s.id,
                          'Rechazado',
                          `Rechazar ${grupo.numeroOrden}`,
                          'Ingresa el motivo del rechazo.',
                          grupo.traslado?.id,
                        )}
                      >
                        <XCircle size={15} /> Rechazar
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            </>
          )}
        </div>

        {/* Modal de Detalle Completo de la Orden (Ojo) */}
        {selectedOrder && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 350,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              onClick={() => setSelectedOrder(null)}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
              }}
            />

            <div
              style={{
                position: 'relative',
                zIndex: 351,
                background: 'white',
                borderRadius: '24px',
                padding: 'clamp(24px, 5vw, 32px)',
                width: '100%',
                maxWidth: '560px',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 24px 48px rgba(8, 17, 31, 0.2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '15px',
                        background: selectedOrder.numeroOrden.includes('CUC') ? '#fdf2f8' : '#eff6ff',
                        color: selectedOrder.numeroOrden.includes('CUC') ? '#9d174d' : '#1e40af',
                        border: `1px solid ${selectedOrder.numeroOrden.includes('CUC') ? '#fbcfe8' : '#bfdbfe'}`,
                      }}
                    >
                      {selectedOrder.numeroOrden}
                    </span>
                    <EstadoBadge estado={selectedOrder.estado} />
                  </div>
                  <h3 style={{ margin: '8px 0 0 0', fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>
                    Detalle Completo de la Orden
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  style={{
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Servicio Principal */}
              <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '14px', marginBottom: '16px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.04em' }}>
                  Servicio Realizado
                </span>
                <h4 style={{ margin: '6px 0 4px 0', fontSize: '16px', fontWeight: 600, color: 'var(--ink)' }}>
                  {selectedOrder.servicioPrincipal.tipo_servicio_nombre ?? '—'}
                </h4>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginBottom: '12px' }}>
                  {formatCOP(selectedOrder.servicioPrincipal.valor_cobrado)}
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Descripción completa del servicio:
                  </span>
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      fontSize: '14px',
                      lineHeight: '1.5',
                      color: 'var(--ink)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {selectedOrder.servicioPrincipal.descripcion_especifica || 'Sin descripción proporcionada.'}
                  </div>
                </div>
              </div>

              {/* Traslado si lo tiene */}
              {selectedOrder.traslado && (
                <div style={{ padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '14px', marginBottom: '16px', border: '1px solid #bbf7d0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Truck size={16} style={{ color: '#166534' }} />
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#166534', letterSpacing: '0.04em' }}>
                      Traslado Adicional
                    </span>
                  </div>
                  <h4 style={{ margin: '4px 0', fontSize: '15px', fontWeight: 600, color: '#166534' }}>
                    {selectedOrder.traslado.tipo_servicio_nombre ?? 'Traslado'}
                  </h4>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#166534', marginBottom: '10px' }}>
                    {formatCOP(selectedOrder.traslado.valor_cobrado)}
                  </div>
                  <div style={{ fontSize: '13px', color: '#14532d', backgroundColor: 'rgba(255,255,255,0.7)', padding: '8px 12px', borderRadius: '8px' }}>
                    <strong>Destino y vehículo:</strong> {selectedOrder.traslado.descripcion_especifica || 'Registrado'}
                  </div>
                </div>
              )}

              {(selectedOrder.servicioPrincipal.fotos?.length ?? 0) > 0 && (
                <section style={{ marginBottom: 18 }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--ink)' }}>Fotos de la orden ({selectedOrder.servicioPrincipal.fotos!.length})</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                    {selectedOrder.servicioPrincipal.fotos!.map((photo, index) => (
                      <button key={`${index}-${photo.slice(-10)}`} type="button" onClick={() => setSelectedPhoto(photo)} aria-label={`Ampliar foto ${index + 1}`} style={{ padding: 0, border: '2px solid #cbd5e1', borderRadius: 9, background: 'white', cursor: 'zoom-in', overflow: 'hidden' }}>
                        <img src={photo} alt={`Foto ${index + 1} de la orden ${selectedOrder.numeroOrden}`} style={{ display: 'block', width: 76, height: 76, objectFit: 'cover' }} />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {[
                ...selectedOrder.servicioPrincipal.auditoria ?? [],
                ...selectedOrder.traslado?.auditoria ?? [],
              ].length > 0 && (
                <section style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: '#f8fafc', border: '1px solid #dbe3ec' }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink)' }}>Historial de revisión</h4>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {[
                      ...selectedOrder.servicioPrincipal.auditoria ?? [],
                      ...selectedOrder.traslado?.auditoria ?? [],
                    ].sort((a, b) => new Date(b.fecha_accion ?? 0).getTime() - new Date(a.fecha_accion ?? 0).getTime()).map((entry) => (
                      <div key={entry.id} style={{ padding: '10px 11px', borderLeft: '3px solid #0057b8', borderRadius: '0 8px 8px 0', background: 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 5 }}>
                          <strong style={{ fontSize: 13, color: '#0f172a' }}>{entry.admin || 'Administrador'}</strong>
                          <time style={{ fontSize: 12, color: '#475569', fontWeight: 600 }} dateTime={entry.fecha_accion ?? undefined}>{entry.fecha_accion ? new Date(entry.fecha_accion).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : 'Fecha no disponible'}</time>
                        </div>
                        <div style={{ fontSize: 13, color: '#334155' }}>
                          {entry.estado_anterior || 'Sin estado'} <strong aria-hidden="true">→</strong> <strong>{entry.estado_nuevo}</strong>
                        </div>
                        {entry.observacion && <p style={{ margin: '5px 0 0', fontSize: 13, color: '#334155', lineHeight: 1.45 }}><strong>Cambio / nota:</strong> {entry.observacion}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Total Orden */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', backgroundColor: '#f1f5f9', borderRadius: '12px', marginBottom: '20px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)' }}>Total Cobrado por esta Orden:</span>
                <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--blue)' }}>{formatCOP(selectedOrder.totalValor)}</span>
              </div>

              {/* Botón Cerrar */}
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--ink)',
                  color: 'white',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        )}

        {selectedPhoto && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Vista ampliada de foto"
            onClick={() => setSelectedPhoto(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(5, 10, 20, .88)', cursor: 'zoom-out' }}
          >
            <button type="button" onClick={() => setSelectedPhoto(null)} aria-label="Cerrar foto" style={{ position: 'absolute', top: 18, right: 18, width: 42, height: 42, borderRadius: '50%', border: '1px solid rgba(255,255,255,.45)', background: 'rgba(255,255,255,.12)', color: 'white', fontSize: 25, cursor: 'pointer' }}>×</button>
            <img src={selectedPhoto} alt="Foto ampliada de la orden" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 'min(100%, 1200px)', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, cursor: 'default' }} />
          </div>
        )}

        {serviceTypeTarget && (
          <div className="service-type-backdrop">
            <form className="service-type-modal" onSubmit={handleSaveServiceType}>
              <div className="service-type-heading">
                <div>
                  <p>ORDEN {serviceTypeTarget.numero_orden}</p>
                  <h2>Cambiar tipo de servicio</h2>
                </div>
                <button type="button" onClick={() => setServiceTypeTarget(null)} aria-label="Cerrar">×</button>
              </div>
              <p className="service-type-current">{serviceTypeTarget.tipo_servicio_nombre ?? 'Tipo actual no disponible'}</p>
              <label className="service-type-label" htmlFor="admin-service-type-select">Nuevo tipo</label>
              <select
                id="admin-service-type-select"
                value={selectedTypeId}
                onChange={(event) => setSelectedTypeId(event.target.value)}
                disabled={loadingServiceTypes || savingServiceType}
                required
              >
                <option value="" disabled>{loadingServiceTypes ? 'Cargando tipos…' : 'Selecciona un tipo de servicio'}</option>
                {availableServiceTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.nombre} — {formatCOP(Number(type.valor_estandar))}
                  </option>
                ))}
              </select>
              {selectedTypeId !== serviceTypeTarget.tipo_servicio_id && (
                <div className="service-type-price-note">
                  El valor cobrado cambiará de <strong>{formatCOP(serviceTypeTarget.valor_cobrado)}</strong> a{' '}
                  <strong>{formatCOP(Number(availableServiceTypes.find((type) => type.id === selectedTypeId)?.valor_estandar ?? 0))}</strong>,
                  según la tarifa estándar del nuevo tipo.
                </div>
              )}
              {serviceTypeError && <p className="service-type-error" role="alert">{serviceTypeError}</p>}
              <div className="service-type-actions">
                <button type="button" onClick={() => setServiceTypeTarget(null)} disabled={savingServiceType}>Cancelar</button>
                <button
                  type="submit"
                  disabled={loadingServiceTypes || savingServiceType || !selectedTypeId || selectedTypeId === serviceTypeTarget.tipo_servicio_id}
                >
                  {savingServiceType ? 'Guardando…' : 'Cambiar tipo y tarifa'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal de Acción (Aprobar / Observar / Rechazar) */}
        {target && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              onClick={() => setTarget(null)}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
              }}
            />

            <div
              style={{
                position: 'relative',
                zIndex: 301,
                background: 'white',
                borderRadius: '24px',
                padding: 'clamp(24px, 5vw, 36px)',
                width: '100%',
                maxWidth: '480px',
                boxShadow: '0 24px 48px rgba(8, 17, 31, 0.2)',
              }}
            >
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
                {target.title}
              </h2>
              {target.subtitle && (
                <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {target.subtitle}
                </p>
              )}

              <form onSubmit={handleSubmitAction}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                    Observación {target.action === 'Aprobado' ? '(opcional)' : '(recomendada)'}
                  </label>
                  <textarea
                    rows={3}
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    placeholder={
                      target.action === 'Aprobado'
                        ? 'Ej: Servicio verificado y conforme.'
                        : 'Indica el motivo de la observación o rechazo...'
                    }
                    style={{
                      width: '100%',
                      marginTop: '6px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>

                {actionError && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(211,47,47,0.1)',
                      color: '#d32f2f',
                      fontSize: '13px',
                      marginBottom: '16px',
                    }}
                  >
                    {actionError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setTarget(null)}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(0,0,0,0.15)',
                      background: 'white',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{
                      flex: 1,
                      padding: '10px',
                      borderRadius: '10px',
                      border: 'none',
                      color: 'white',
                      fontWeight: 600,
                      cursor: submitting ? 'wait' : 'pointer',
                      background:
                        target.action === 'Aprobado'
                          ? '#16a34a'
                          : target.action === 'Observado'
                            ? '#d97706'
                            : '#dc2626',
                    }}
                  >
                    {submitting ? 'Guardando…' : `Confirmar ${target.action}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

// ---- Estilos ----

const backBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid rgba(0,0,0,0.1)',
  backgroundColor: 'white',
  color: 'var(--ink)',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid rgba(0,0,0,0.1)',
  backgroundColor: 'white',
  color: 'var(--ink)',
  fontWeight: 600,
  fontSize: '13px',
  cursor: 'pointer',
};

const headerCardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '24px',
  padding: '28px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.05)',
  marginBottom: '24px',
};

const sectionCardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '24px',
  padding: '28px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.05)',
};

const infoBlockStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
};

const infoLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  letterSpacing: '0.04em',
};

const infoValueStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--ink)',
  marginTop: '2px',
};

const thStyle: React.CSSProperties = {
  padding: '12px 10px',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '14px 10px',
  fontSize: '14px',
};

const obsNoteStyle: React.CSSProperties = {
  marginTop: '6px',
  padding: '4px 8px',
  borderRadius: '6px',
  backgroundColor: '#fffbeb',
  color: '#b45309',
  fontSize: '12px',
  border: '1px solid #fef3c7',
};

const actionMiniBtn: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '8px',
  border: '1px solid transparent',
  fontSize: '12px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s ease',
};

const approveBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '10px',
  border: 'none',
  backgroundColor: '#16a34a',
  color: 'white',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const observeBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid #f59e0b',
  backgroundColor: '#fffbeb',
  color: '#b45309',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const rejectBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: '10px',
  border: 'none',
  backgroundColor: '#dc2626',
  color: 'white',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const counterBadge = (bg: string, color: string): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: '8px',
  backgroundColor: bg,
  color,
  fontSize: '12px',
  fontWeight: 600,
});

const emptyBoxStyle: React.CSSProperties = {
  padding: '40px',
  textAlign: 'center',
  color: 'var(--text-secondary)',
  backgroundColor: '#fafafa',
  borderRadius: '16px',
  border: '1px dashed #ddd',
};

const errorCardStyle: React.CSSProperties = {
  padding: '24px',
  borderRadius: '16px',
  backgroundColor: '#ffebeb',
  color: '#d32f2f',
  marginTop: '20px',
};
