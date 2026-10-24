import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '../../layouts/MainLayout';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { reviewApi, type DashboardSummary } from '../../services/adminApi';
import { EstadoBadge } from '../../components/EstadoBadge';
import { formatCOP, nombreMes } from '../../lib/period';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await reviewApi.getDashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const c = data?.cuentas;
  const v = data?.valores;
  const s = data?.servicios;
  const t = data?.tecnicos;

  const porRevisar = (c?.pendientes ?? 0) + (c?.observadas ?? 0);

  return (
    <MainLayout>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(26px, 5vw, 34px)', fontWeight: '700', letterSpacing: '-0.03em', margin: 0 }}>
              Panel de Control
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '17px', margin: '4px 0 0 0' }}>
              Resumen de cuentas de cobro radicadas.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            style={{
              padding: '11px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(0,0,0,0.1)',
              background: 'white',
              color: 'var(--ink)',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={15} />
            Actualizar
          </button>
        </header>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: 'rgba(245,196,0,0.15)',
              border: '1px solid rgba(245,196,0,0.45)',
              color: '#7a5c00',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '24px',
            }}
          >
            {error}
          </div>
        )}

        {/* KPI Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '24px',
            marginBottom: '40px',
          }}
        >
          <StatCard
            label="Cobros Pendientes"
            value={loading ? '—' : formatCOP(v?.pendiente ?? 0)}
            hint={`${c?.pendientes ?? 0} cuenta(s) sin aprobar`}
            color="var(--blue)"
          />
          <StatCard
            label="Pagos Aprobados"
            value={loading ? '—' : formatCOP(v?.aprobado ?? 0)}
            hint={`${c?.aprobadas ?? 0} cuenta(s) aprobada(s)`}
            color="#2d8a39"
          />
          <StatCard
            label="Cuentas Radicadas"
            value={loading ? '—' : String(c?.total ?? 0)}
            hint={`${s?.total ?? 0} servicio(s) en total`}
            color="var(--gold)"
          />
          <StatCard
            label="Requieren Atención"
            value={loading ? '—' : String((c?.observadas ?? 0) + (c?.rechazadas ?? 0))}
            hint={`${c?.observadas ?? 0} observada(s) · ${c?.rechazadas ?? 0} rechazada(s)`}
            color="#ff3b30"
          />
        </div>

        {/* Main Content Grid */}
        <div className="content-grid">
          {/* Recent accounts table */}
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '24px',
              padding: '24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px' }}>
              Cuentas Recientes
            </h3>
            {loading ? (
              <EmptyMsg>Cargando…</EmptyMsg>
            ) : !data || data.recientes.length === 0 ? (
              <EmptyMsg>Aún no hay cuentas radicadas.</EmptyMsg>
            ) : (
              <div className="table-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)', fontSize: '13px', borderBottom: '1px solid #eee' }}>
                      <th style={{ padding: '12px 0', fontWeight: '500' }}>Técnico</th>
                      <th style={{ padding: '12px 0', fontWeight: '500' }}>Período</th>
                      <th style={{ padding: '12px 0', fontWeight: '500' }}>Monto</th>
                      <th style={{ padding: '12px 0', fontWeight: '500' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recientes.map((r) => (
                      <tr
                        key={r.id}
                        style={{ borderBottom: '1px solid #f9f9f9', transition: 'background 0.2s', cursor: 'pointer' }}
                        onClick={() => navigate('/admin/review')}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fcfcfc')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '16px 0', fontSize: '14px', fontWeight: 500 }}>{r.tecnico ?? '—'}</td>
                        <td style={{ padding: '16px 0', fontSize: '14px' }}>
                          {nombreMes(r.mes)} {r.anio}
                        </td>
                        <td style={{ padding: '16px 0', fontSize: '14px', fontWeight: 600 }}>{formatCOP(r.total)}</td>
                        <td style={{ padding: '16px 0', fontSize: '14px' }}>
                          <EstadoBadge estado={r.estado} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick actions / Alerts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div
              style={{
                backgroundColor: 'var(--blue)',
                borderRadius: '24px',
                padding: '24px',
                color: 'white',
                boxShadow: '0 10px 20px rgba(0, 87, 184, 0.2)',
              }}
            >
              <h4 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: '600' }}>Acceso Rápido</h4>
              <p style={{ fontSize: '14px', opacity: 0.9, marginBottom: '20px' }}>
                Revisa y aprueba los servicios y cuentas radicadas por los técnicos.
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/review')}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: 'white',
                  color: 'var(--blue)',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <ClipboardCheck size={16} strokeWidth={2.5} />
                Ir a Revisión
              </button>
            </div>

            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                padding: '24px',
                border: '1px solid rgba(0,0,0,0.05)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              }}
            >
              <h4 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Alertas</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {porRevisar > 0 ? (
                  <Alert
                    message={`${porRevisar} cuenta(s) pendiente(s) de revisión`}
                    type="warning"
                  />
                ) : (
                  <Alert message="No hay cuentas pendientes de revisión" type="info" />
                )}
                {s && s.pendientes > 0 && (
                  <Alert message={`${s.pendientes} servicio(s) sin aprobar`} type="warning" />
                )}
                <Alert
                  message={`${t?.activos ?? 0} técnico(s) activo(s) de ${t?.total ?? 0}`}
                  type="info"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

const StatCard = ({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color: string;
}) => (
  <div
    style={{
      backgroundColor: 'white',
      borderRadius: '24px',
      padding: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
      border: '1px solid rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}
  >
    <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>{label}</span>
    <span style={{ fontSize: '28px', fontWeight: '700', color: 'var(--ink)' }}>{value}</span>
    {hint && <span style={{ fontSize: '13px', fontWeight: '600', color }}>{hint}</span>}
  </div>
);

const EmptyMsg = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      padding: '32px',
      textAlign: 'center',
      color: 'var(--text-secondary)',
      fontSize: '15px',
      backgroundColor: '#fafafa',
      borderRadius: '16px',
      border: '1px dashed #ddd',
    }}
  >
    {children}
  </div>
);

const Alert = ({ message, type }: { message: string; type: 'warning' | 'info' }) => (
  <div
    style={{
      padding: '12px',
      borderRadius: '12px',
      fontSize: '13px',
      backgroundColor: type === 'warning' ? 'rgba(255, 159, 10, 0.1)' : 'rgba(0, 87, 184, 0.05)',
      color: type === 'warning' ? '#b47a00' : 'var(--blue)',
      borderLeft: `4px solid ${type === 'warning' ? '#ff9f0a' : 'var(--blue)'}`,
    }}
  >
    {message}
  </div>
);
