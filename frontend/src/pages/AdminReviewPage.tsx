import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  useUsers,
  reviewApi,
  type Account,
  type ExceptionRow,
} from '../services/adminApi';
import { UserList } from '../components/UserList';
import { UserCreateModal } from '../components/UserCreateModal';
import { ExceptionModal } from '../components/ExceptionModal';
import { EstadoBadge } from '../components/EstadoBadge';
import { formatCOP, nombreMes } from '../lib/period';

type Tab = 'cuentas' | 'usuarios' | 'excepciones';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cuentas', label: 'Cuentas de cobro' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'excepciones', label: 'Excepciones' },
];

export const AdminReviewPage = () => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('cuentas');

  // ---- Usuarios ----
  const {
    users,
    loading: usersLoading,
    error: usersError,
    load: loadUsers,
    create: createUser,
    updateRole,
    toggleActive,
    deleteUser,
  } = useUsers();

  const [modalMode, setModalMode] = useState<'create' | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState(false);

  // ---- Cuentas / Excepciones ----
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // ---- Excepción ----
  const [exceptionModalOpen, setExceptionModalOpen] = useState(false);
  const [exceptionUser, setExceptionUser] = useState<{ id: string; name: string } | null>(null);
  const [exceptionSaving, setExceptionSaving] = useState(false);
  const [exceptionError, setExceptionError] = useState<string | null>(null);

  // ---- Filtros cuentas ----
  const [filtroEstado, setFiltroEstado] = useState<string>(searchParams.get('estado') === 'revision' ? 'revision' : '');
  const [filtroAnio, setFiltroAnio] = useState<string>('');

  // ---- Cargas ----
  const loadAccounts = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      setAccounts(await reviewApi.getAccounts());
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'No se pudieron cargar las cuentas.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  const loadExceptions = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      setExceptions(await reviewApi.getExceptions());
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'No se pudieron cargar las excepciones.');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'cuentas') loadAccounts();
    else if (tab === 'excepciones') loadExceptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ---- Acciones ----
  const handleCreateException = async (form: { usuario_id: string; fecha_vencimiento: string; motivo?: string }) => {
    setExceptionSaving(true);
    setExceptionError(null);
    try {
      await reviewApi.createException({
        usuario_id: form.usuario_id,
        fecha_vencimiento: form.fecha_vencimiento,
        motivo: form.motivo,
      });
      setExceptionModalOpen(false);
      setExceptionUser(null);
      await loadExceptions();
    } catch (err) {
      setExceptionError(err instanceof Error ? err.message : 'No se pudo crear la excepción.');
      throw err;
    } finally {
      setExceptionSaving(false);
    }
  };

  const handleCreateUser = useCallback(
    async (payload: {
      username: string;
      nombre_completo: string;
      email: string;
      password: string;
      generatePassword: boolean;
      rol: 'Tecnico' | 'Admin';
      sede?: string;
    }) => {
      setModalSaving(true);
      setModalError(null);
      try {
        const result = await createUser({
          username: payload.username,
          nombre_completo: payload.nombre_completo,
          email: payload.email,
          password: payload.password,
          generate_password: payload.generatePassword,
          rol: payload.rol,
          sede: payload.sede,
        });
        return { generatedPassword: result.generatedPassword, created: true };
      } catch (err) {
        setModalError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
        throw err;
      } finally {
        setModalSaving(false);
      }
    },
    [createUser],
  );

  const refreshCurrent = () => {
    if (tab === 'cuentas') loadAccounts();
    else if (tab === 'usuarios') loadUsers();
    else if (tab === 'excepciones') loadExceptions();
  };

  // ---- Cuentas filtradas ----
  const cuentasFiltradas = accounts.filter((a) => {
    if (filtroEstado === 'revision' && !['Pendiente', 'Observado', 'Rechazado'].includes(a.estado)) return false;
    if (filtroEstado && filtroEstado !== 'revision' && a.estado !== filtroEstado) return false;
    if (filtroAnio && String(a.anio) !== filtroAnio) return false;
    return true;
  }).sort((a, b) => {
    const priority = (estado: string) =>
      estado === 'Rechazado' ? 0
        : estado === 'Observado' ? 1
          : estado === 'Pendiente' ? 2 : 3;
    const byPriority = priority(a.estado) - priority(b.estado);
    if (byPriority !== 0) return byPriority;
    return new Date(a.fecha_creacion ?? 0).getTime() - new Date(b.fecha_creacion ?? 0).getTime();
  });

  const aniosDisponibles = [...new Set(accounts.map((a) => a.anio))].sort((x, y) => y - x);

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
            marginBottom: '24px',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 'clamp(26px, 5vw, 34px)', fontWeight: '700', letterSpacing: '-0.03em', margin: 0 }}>
              Revisión Administrativa
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '17px', margin: '4px 0 0 0' }}>
              Gestiona cuentas de cobro, usuarios y excepciones.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={refreshCurrent} style={secondaryBtn}>
              <RefreshCw size={15} />
              Actualizar
            </button>
            {tab === 'usuarios' && (
              <button type="button" onClick={() => { setModalError(null); setModalMode('create'); }} style={primaryBtn}>
                <Plus size={15} strokeWidth={2.5} />
                Nuevo usuario
              </button>
            )}
            {tab === 'excepciones' && (
              <button
                type="button"
                onClick={() => {
                  setExceptionError(null);
                  setExceptionUser(null);
                  setExceptionModalOpen(true);
                }}
                style={primaryBtn}
              >
                <Plus size={15} strokeWidth={2.5} />
                Nueva excepción
              </button>
            )}
          </div>
        </header>

        {/* Pestañas */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            backgroundColor: 'rgba(0,0,0,0.04)',
            padding: '4px',
            borderRadius: '14px',
            marginBottom: '24px',
            flexWrap: 'wrap',
            width: 'fit-content',
            maxWidth: '100%',
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: '9px 16px',
                borderRadius: '11px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: tab === t.id ? 600 : 500,
                backgroundColor: tab === t.id ? 'white' : 'transparent',
                color: tab === t.id ? 'var(--ink)' : 'var(--text-secondary)',
                boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t.label}
              {t.id === 'cuentas' && accounts.length > 0 && (
                <span
                  style={{
                    marginLeft: '6px',
                    padding: '1px 7px',
                    borderRadius: '10px',
                    background: tab === t.id ? '#e0edff' : 'rgba(0,0,0,0.08)',
                    color: tab === t.id ? 'var(--blue)' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {accounts.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {dataError && tab !== 'usuarios' && <div style={errorBox}>{dataError}</div>}
        {tab === 'usuarios' && usersError && <div style={errorBox}>{usersError}</div>}

        {/* ---- PESTAÑA: CUENTAS ---- */}
        {tab === 'cuentas' && (
          <div>
            {/* Filtros rápidos */}
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '16px',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                style={filterSelectStyle}
              >
                <option value="">Todos los estados</option>
                <option value="revision">Requieren revisión</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Aprobado">Aprobado</option>
                <option value="Observado">Observado</option>
                <option value="Rechazado">Rechazado</option>
              </select>

              <select
                value={filtroAnio}
                onChange={(e) => setFiltroAnio(e.target.value)}
                style={filterSelectStyle}
              >
                <option value="">Todos los años</option>
                {aniosDisponibles.map((a) => (
                  <option key={a} value={String(a)}>{a}</option>
                ))}
              </select>

              {(filtroEstado || filtroAnio) && (
                <button
                  type="button"
                  onClick={() => { setFiltroEstado(''); setFiltroAnio(''); }}
                  style={{ ...secondaryBtn, padding: '7px 12px', fontSize: '13px' }}
                >
                  Limpiar filtros
                </button>
              )}

              <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {cuentasFiltradas.length} cuenta{cuentasFiltradas.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                padding: '24px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                border: '1px solid rgba(0,0,0,0.05)',
              }}
            >
              <h3 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 20px 0' }}>
                Cuentas de cobro radicadas
              </h3>
              {dataLoading ? (
                <Empty>Cargando…</Empty>
              ) : cuentasFiltradas.length === 0 ? (
                <Empty>
                  {accounts.length === 0
                    ? 'No hay cuentas radicadas aún.'
                    : 'Ninguna cuenta coincide con los filtros aplicados.'}
                </Empty>
              ) : (
                <div className="table-scroll table-wide">
                  <table style={tableStyle}>
                    <thead>
                      <tr style={theadRow}>
                        <th style={th}>Técnico</th>
                        <th style={th}>Sede</th>
                        <th style={th}>Período</th>
                        <th style={th}>Servicios</th>
                        <th style={th}>Estado</th>
                        <th style={{ ...th, textAlign: 'right' }}>Total</th>
                        <th style={{ ...th, textAlign: 'right' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuentasFiltradas.map((a) => (
                        <tr
                          key={a.id}
                          style={{ ...tbodyRow, cursor: 'pointer' }}
                          onClick={() => navigate(`/admin/cuentas/${a.id}`)}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8faff')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <td style={{ ...td, fontWeight: 600 }}>{a.tecnico ?? '—'}</td>
                          <td style={td}>
                            {a.tecnico_sede ? (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  backgroundColor: a.tecnico_sede === 'Cucuta' ? '#fdf2f8' : '#eff6ff',
                                  color: a.tecnico_sede === 'Cucuta' ? '#9d174d' : '#1e40af',
                                  border: `1px solid ${a.tecnico_sede === 'Cucuta' ? '#fbcfe8' : '#bfdbfe'}`,
                                }}
                                >
                                  {a.tecnico_sede === 'Cucuta' ? 'CUC' : 'BUC'}
                                </span>
                              ) : '—'}
                          </td>
                          <td style={td}>
                            <div>{nombreMes(a.mes)} {a.anio}</div>
                            {a.estado !== 'Aprobado' && a.fecha_creacion && (
                              <div style={{
                                marginTop: 4,
                                color: Date.now() - new Date(a.fecha_creacion).getTime() >= 3 * 86_400_000 ? '#b91c1c' : '#64748b',
                                fontSize: 11,
                                fontWeight: 600,
                              }}>
                                {Math.max(0, Math.floor((Date.now() - new Date(a.fecha_creacion).getTime()) / 86_400_000))} días en revisión
                              </div>
                            )}
                          </td>
                          <td style={td}>{a.total_servicios} servicio{a.total_servicios !== 1 ? 's' : ''}</td>
                          <td style={td}>
                            <EstadoBadge estado={a.estado} />
                          </td>
                          <td style={{ ...td, fontWeight: 600, textAlign: 'right' }}>{formatCOP(a.total)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); navigate(`/admin/cuentas/${a.id}`); }}
                              style={reviewBtn}
                            >
                              Ver detalle →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---- PESTAÑA: USUARIOS ---- */}
        {tab === 'usuarios' && (
          <UserList
            users={users}
            loading={usersLoading}
            currentUserId={currentUser?.id}
            onUpdateRole={(id, rol) => updateRole(id, rol).then(() => undefined)}
            onToggleActive={(id, reason) => toggleActive(id, reason).then(() => undefined)}
            onDeleteUser={(id) => deleteUser(id)}
            onCreateExceptionForUser={(id) => {
              const u = users.find((x) => x.id === id);
              setExceptionError(null);
              setExceptionUser({ id, name: u?.nombre_completo ?? '' });
              setExceptionModalOpen(true);
            }}
            onSelectUser={(id) => navigate(`/admin/users/${id}`)}
          />
        )}

        {/* ---- PESTAÑA: EXCEPCIONES ---- */}
        {tab === 'excepciones' && (
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '24px',
              padding: '24px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <h3 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 6px 0' }}>
              Excepciones de carga ({exceptions.length})
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Permiten a un técnico radicar servicios fuera de la ventana del 1 al 5.
            </p>
            {dataLoading ? (
              <Empty>Cargando…</Empty>
            ) : exceptions.length === 0 ? (
              <Empty>No hay excepciones registradas.</Empty>
            ) : (
              <div className="table-scroll table-wide">
                <table style={tableStyle}>
                  <thead>
                    <tr style={theadRow}>
                      <th style={th}>Técnico</th>
                      <th style={th}>Vence</th>
                      <th style={th}>Motivo</th>
                      <th style={th}>Creada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((e) => {
                      const vence = new Date(e.fecha_vencimiento);
                      const vigente = vence >= new Date();
                      return (
                        <tr key={e.id} style={tbodyRow}>
                          <td style={{ ...td, fontWeight: 600 }}>{e.tecnico ?? '—'}</td>
                          <td style={td}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                backgroundColor: vigente ? '#e6f4ea' : '#f5f5f5',
                                color: vigente ? '#137333' : '#9e9e9e',
                              }}
                            >
                              {vence.toLocaleDateString('es-CO')}
                              {vigente ? ' ✓ Vigente' : ' Vencida'}
                            </span>
                          </td>
                          <td style={{ ...td, color: 'var(--text-secondary)' }}>{e.motivo || '—'}</td>
                          <td style={td}>{e.created_at ? new Date(e.created_at).toLocaleDateString('es-CO') : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de creación de usuario */}
      <UserCreateModal
        open={modalMode === 'create'}
        onClose={() => setModalMode(null)}
        onSubmit={handleCreateUser}
        saving={modalSaving}
        error={modalError}
        success={false}
      />

      {/* Modal de excepción */}
      <ExceptionModal
        open={exceptionModalOpen}
        userId={exceptionUser?.id ?? null}
        userName={exceptionUser?.name}
        technicians={users
          .filter((u) => u.rol === 'Tecnico' && u.activo)
          .map((u) => ({ id: u.id, nombre_completo: u.nombre_completo, email: u.email }))}
        onClose={() => {
          setExceptionModalOpen(false);
          setExceptionUser(null);
          setExceptionError(null);
        }}
        onSubmit={handleCreateException}
        saving={exceptionSaving}
        error={exceptionError}
      />
    </MainLayout>
  );
};

// ---- Helpers ----

const Empty = ({ children }: { children: React.ReactNode }) => (
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

// ---- Estilos ----

const primaryBtn: React.CSSProperties = {
  padding: '11px 16px',
  borderRadius: '12px',
  border: 'none',
  background: 'linear-gradient(180deg, #0066cc 0%, #0057B8 100%)',
  color: 'white',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0,87,184,0.2)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
};

const secondaryBtn: React.CSSProperties = {
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
};

const filterSelectStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid rgba(0,0,0,0.1)',
  fontSize: '13px',
  outline: 'none',
  cursor: 'pointer',
  background: 'white',
};

const reviewBtn: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '8px',
  border: '1px solid var(--blue)',
  background: 'transparent',
  color: 'var(--blue)',
  fontWeight: 600,
  fontSize: '12px',
  cursor: 'pointer',
};

const errorBox: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: '12px',
  backgroundColor: 'rgba(245,196,0,0.15)',
  border: '1px solid rgba(245,196,0,0.45)',
  color: '#7a5c00',
  fontSize: '14px',
  fontWeight: 500,
  marginBottom: '16px',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
};

const theadRow: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '13px',
  borderBottom: '1px solid #eee',
};

const tbodyRow: React.CSSProperties = { borderBottom: '1px solid #f9f9f9', transition: 'background 0.15s' };

const th: React.CSSProperties = { padding: '14px 0', fontWeight: 500 };

const td: React.CSSProperties = { padding: '14px 0', fontSize: '14px' };

const cardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '16px',
  padding: '16px',
  border: '1px solid rgba(0,0,0,0.08)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  cursor: 'pointer',
  marginBottom: '12px',
};
