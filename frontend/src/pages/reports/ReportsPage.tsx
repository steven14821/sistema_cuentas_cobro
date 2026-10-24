import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MainLayout } from '../../layouts/MainLayout';
import { Download } from 'lucide-react';
import { reviewApi, useUsers, type Account, type ExceptionRow } from '../../services/adminApi';
import type { EstadoServicio } from '../../services/technicianApi';
import type { ReportData, ReportColumn } from '../../lib/report';
import { downloadReportPdf, downloadReportCsv } from '../../lib/report';
import { EstadoBadge } from '../../components/EstadoBadge';
import { formatCOP, nombreMes, getColombiaToday } from '../../lib/period';

type ReportType = 'mensual' | 'anual' | 'tecnico' | 'excepciones';
type Formato = 'pdf' | 'excel';

const pad2 = (n: number) => String(n).padStart(2, '0');

export const ReportsPage = () => {
  const hoy = getColombiaToday();
  const [reportType, setReportType] = useState<ReportType>('mensual');
  const [formato, setFormato] = useState<Formato>('pdf');
  const [periodo, setPeriodo] = useState(`${hoy.anio}-${pad2(hoy.mes)}`);
  const [tecnicoId, setTecnicoId] = useState('');

  const { users, load: loadUsers } = useUsers();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [anio, mes] = useMemo(() => {
    const [y, m] = periodo.split('-').map(Number);
    return [y || hoy.anio, m || hoy.mes];
  }, [periodo, hoy.anio, hoy.mes]);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setError(null);

    if (reportType === 'excepciones') {
      setLoading(true);
      try {
        setExceptions(await reviewApi.getExceptions());
        setAccounts([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las excepciones.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (reportType === 'tecnico' && !tecnicoId) {
      setAccounts([]);
      return;
    }

    setLoading(true);
    try {
      const params: { mes?: number; anio?: number; usuario_id?: string } = {};
      if (reportType === 'mensual' || reportType === 'tecnico') params.mes = mes;
      params.anio = anio;
      if (reportType === 'tecnico') params.usuario_id = tecnicoId;
      setAccounts(await reviewApi.getAccounts(params));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las cuentas.');
    } finally {
      setLoading(false);
    }
  }, [reportType, mes, anio, tecnicoId]);

  useEffect(() => {
    load();
  }, [load]);

  const tecnicoNombre = users.find((u) => u.id === tecnicoId)?.nombre_completo ?? '';

  const report: ReportData = useMemo(() => {
    if (reportType === 'excepciones') {
      return {
        title: 'Reporte de Excepciones',
        subtitle: 'Todas las excepciones de carga registradas',
        columns: [
          { header: 'Técnico', key: 'tecnico' },
          { header: 'Vence', key: 'vence' },
          { header: 'Motivo', key: 'motivo' },
          { header: 'Creada', key: 'creada' },
        ] as ReportColumn[],
        rows: exceptions.map((e) => ({
          tecnico: e.tecnico ?? '—',
          vence: new Date(e.fecha_vencimiento).toLocaleDateString('es-CO'),
          motivo: e.motivo || '—',
          creada: e.created_at ? new Date(e.created_at).toLocaleDateString('es-CO') : '—',
        })),
      };
    }

    const titulo =
      reportType === 'mensual'
        ? 'Reporte Mensual'
        : reportType === 'anual'
          ? 'Reporte Anual'
          : 'Reporte por Técnico';

    const subtitulo =
      reportType === 'anual'
        ? `Año ${anio}`
        : reportType === 'tecnico'
          ? `${tecnicoNombre || 'Técnico'} · ${nombreMes(mes)} ${anio}`
          : `${nombreMes(mes)} ${anio}`;

    return {
      title: titulo,
      subtitle: subtitulo,
      columns: [
        { header: 'Técnico', key: 'tecnico' },
        { header: 'Período', key: 'periodo' },
        { header: 'Servicios', key: 'servicios', align: 'right' },
        { header: 'Estado', key: 'estado' },
        { header: 'Total', key: 'total', align: 'right' },
      ] as ReportColumn[],
      rows: accounts.map((a) => ({
        tecnico: a.tecnico ?? '—',
        periodo: `${nombreMes(a.mes)} ${a.anio}`,
        servicios: a.total_servicios,
        estado: a.estado,
        total: formatCOP(a.total),
      })),
      totalsLabel: `Total (${accounts.length} cuenta${accounts.length !== 1 ? 's' : ''})`,
      totalsValue: formatCOP(accounts.reduce((acc, a) => acc + a.total, 0)),
    };
  }, [reportType, accounts, exceptions, mes, anio, tecnicoNombre]);

  const handleExport = () => {
    if (reportType === 'tecnico' && !tecnicoId) {
      setError('Selecciona un técnico para generar el reporte.');
      return;
    }
    const base =
      reportType === 'anual'
        ? `reporte-anual-${anio}`
        : reportType === 'excepciones'
          ? `reporte-excepciones`
          : `reporte-${reportType}-${anio}-${pad2(mes)}`;
    if (formato === 'pdf') downloadReportPdf(report, `${base}.pdf`);
    else downloadReportCsv(report, `${base}.csv`);
  };

  const sinTecnico = reportType === 'tecnico' && !tecnicoId;

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
            marginBottom: '40px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(26px, 5vw, 34px)', fontWeight: '700', letterSpacing: '-0.03em', margin: 0 }}>
              Reportes Globales
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '17px', margin: '4px 0 0 0' }}>
              Exportación de datos para gestión contable y auditoría.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            disabled={sinTecnico}
            style={{
              padding: '12px 24px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: sinTecnico ? 'var(--text-secondary)' : 'var(--blue)',
              color: 'white',
              fontWeight: '600',
              cursor: sinTecnico ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(0, 87, 184, 0.2)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Download size={16} />
            Descargar Reporte Final
          </button>
        </header>

        {/* Configuración */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '24px',
            padding: 'clamp(20px, 4vw, 32px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.05)',
            marginBottom: '32px',
          }}
        >
          <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px' }}>Configurar Exportación</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={labelStyle}>Tipo de Reporte</label>
              <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} style={inputStyle}>
                <option value="mensual">Corte Mensual (Estándar)</option>
                <option value="anual">Resumen Anual</option>
                <option value="tecnico">Por Técnico Específico</option>
                <option value="excepciones">Reporte de Excepciones</option>
              </select>
            </div>

            {reportType === 'tecnico' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>Técnico</label>
                <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} style={inputStyle}>
                  <option value="">Selecciona un técnico…</option>
                  {users
                    .filter((u) => u.rol === 'Tecnico')
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre_completo}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={labelStyle}>Formato de Salida</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => setFormato('pdf')} style={formatoBtn(formato === 'pdf')}>
                  PDF
                </button>
                <button type="button" onClick={() => setFormato('excel')} style={formatoBtn(formato === 'excel')}>
                  Excel (CSV)
                </button>
              </div>
            </div>

            {reportType !== 'excepciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={labelStyle}>Periodo</label>
                <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} style={inputStyle} />
              </div>
            )}
          </div>
        </div>

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

        {/* Vista previa */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '24px',
            padding: '24px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.05)',
          }}
        >
          <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px' }}>Vista Previa de Datos</h3>

          {loading ? (
            <Placeholder>Cargando…</Placeholder>
          ) : sinTecnico ? (
            <Placeholder>Selecciona un técnico para ver los datos.</Placeholder>
          ) : report.rows.length === 0 ? (
            <Placeholder>No hay datos para los parámetros seleccionados.</Placeholder>
          ) : (
            <>
              <div className="table-scroll table-wide">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-secondary)', fontSize: '13px', borderBottom: '1px solid #eee' }}>
                      {report.columns.map((c) => (
                        <th key={c.key} style={{ padding: '14px 0', fontWeight: 500, textAlign: c.align ?? 'left' }}>
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f9f9f9' }}>
                        {report.columns.map((c) => (
                          <td
                            key={c.key}
                            style={{
                              padding: '14px 0',
                              fontSize: '14px',
                              textAlign: c.align ?? 'left',
                              fontWeight: c.key === 'total' ? 600 : 400,
                            }}
                          >
                            {c.key === 'estado' ? (
                              <EstadoBadge estado={row[c.key] as EstadoServicio} compact />
                            ) : (
                              String(row[c.key] ?? '')
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.totalsLabel && report.totalsValue && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '24px',
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '2px solid var(--ink)',
                    fontSize: '16px',
                    fontWeight: 700,
                  }}
                >
                  <span>{report.totalsLabel}</span>
                  <span>{report.totalsValue}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      width: '100%',
      minHeight: '200px',
      borderRadius: '16px',
      backgroundColor: '#f9f9f9',
      border: '1px dashed #ddd',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-secondary)',
      fontSize: '15px',
    }}
  >
    {children}
  </div>
);

const labelStyle: React.CSSProperties = { fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' };

const inputStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: '12px',
  border: '1px solid rgba(0,0,0,0.1)',
  fontSize: '15px',
  outline: 'none',
  background: 'white',
  color: 'var(--ink)',
};

const formatoBtn = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '12px',
  borderRadius: '12px',
  border: `1px solid ${active ? 'var(--blue)' : 'rgba(0,0,0,0.1)'}`,
  backgroundColor: active ? 'var(--blue)' : 'white',
  color: active ? 'white' : 'var(--ink)',
  fontWeight: '600',
  cursor: 'pointer',
});
