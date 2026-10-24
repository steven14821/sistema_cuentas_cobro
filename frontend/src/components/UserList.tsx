import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

export type UserRow = {
  id: string;
  username: string;
  nombre_completo: string;
  email: string;
  rol: 'Tecnico' | 'Admin';
  sede?: string | null;
  activo: boolean;
  created_at: string;
};

type Props = {
  users: UserRow[];
  loading: boolean;
  currentUserId?: string;
  onUpdateRole: (id: string, rol: 'Tecnico' | 'Admin') => Promise<void>;
  onToggleActive: (id: string) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  onCreateExceptionForUser?: (userId: string) => void;
};

export const UserList = ({
  users,
  loading,
  currentUserId,
  onUpdateRole,
  onToggleActive,
  onDeleteUser,
  onCreateExceptionForUser,
}: Props) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelete = async (u: UserRow) => {
    if (u.id === currentUserId) {
      alert('No puedes eliminar tu propio usuario en sesión.');
      return;
    }

    const confirmed = window.confirm(
      `¿Estás seguro de que deseas eliminar al usuario "${u.nombre_completo}" (@${u.username})?\n\nEsta acción eliminará su acceso y registros vinculados.`,
    );
    if (!confirmed) return;

    setDeletingId(u.id);
    setActionError(null);
    try {
      await onDeleteUser(u.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar el usuario.';
      setActionError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
        Cargando usuarios…
      </div>
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '24px',
        padding: '24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        border: '1px solid rgba(0,0,0,0.05)',
      }}
    >
      {actionError && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            backgroundColor: 'rgba(211,47,47,0.1)',
            border: '1px solid rgba(211,47,47,0.3)',
            color: '#d32f2f',
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#d32f2f',
              fontWeight: 700,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="table-scroll table-wide" style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead style={{ borderBottom: '1px solid #eee' }}>
            <tr style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              <th style={{ padding: '14px 0', fontWeight: 500 }}>Usuario</th>
              <th style={{ padding: '14px 0', fontWeight: 500 }}>Nombre</th>
              <th style={{ padding: '14px 0', fontWeight: 500 }}>Correo</th>
              <th style={{ padding: '14px 0', fontWeight: 500 }}>Rol</th>
              <th style={{ padding: '14px 0', fontWeight: 500 }}>Sede</th>
              <th style={{ padding: '14px 0', fontWeight: 500 }}>Estado</th>
              <th style={{ padding: '14px 0', fontWeight: 500, textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const isDeleting = deletingId === u.id;

              return (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: '1px solid #f6f6f6',
                    transition: 'background 0.2s',
                    opacity: isDeleting ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '14px 0', fontSize: '14px', fontWeight: 500 }}>
                    {u.username}
                    {isSelf && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '11px',
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          fontWeight: 600,
                        }}
                      >
                        Tú
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px 0', fontSize: '14px' }}>{u.nombre_completo}</td>
                  <td style={{ padding: '14px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td style={{ padding: '14px 0', fontSize: '14px' }}>
                    <select
                      value={u.rol}
                      disabled={isSelf}
                      onChange={(e) => {
                        const next = e.target.value as 'Tecnico' | 'Admin';
                        if (next !== u.rol) onUpdateRole(u.id, next);
                      }}
                      style={{
                        padding: '5px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--blue)',
                        background: u.rol === 'Admin' ? '#fff6e0' : '#f0f7ff',
                        outline: 'none',
                        cursor: isSelf ? 'not-allowed' : 'pointer',
                        opacity: isSelf ? 0.7 : 1,
                      }}
                      title={isSelf ? 'No puedes cambiar tu propio rol' : undefined}
                    >
                      <option value="Tecnico">Técnico</option>
                      <option value="Admin">Admin</option>
                    </select>
                  </td>
                  <td style={{ padding: '14px 0', fontSize: '13px' }}>
                    {u.rol === 'Tecnico' ? (
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          backgroundColor: u.sede === 'Cucuta' ? '#fdf2f8' : '#eff6ff',
                          color: u.sede === 'Cucuta' ? '#9d174d' : '#1e40af',
                          border: `1px solid ${u.sede === 'Cucuta' ? '#fbcfe8' : '#bfdbfe'}`,
                        }}
                      >
                        {u.sede === 'Cucuta' ? 'Cúcuta (CUC)' : 'Bucaramanga (BUC)'}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 0', fontSize: '14px' }}>
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => onToggleActive(u.id)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(0,0,0,0.1)',
                        background: u.activo ? 'rgba(0,87,184,0.08)' : '#f0f0f0',
                        color: u.activo ? 'var(--blue)' : 'var(--text-secondary)',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: isSelf ? 'not-allowed' : 'pointer',
                        opacity: isSelf ? 0.7 : 1,
                      }}
                      title={isSelf ? 'No puedes desactivar tu propia cuenta' : undefined}
                    >
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td style={{ padding: '14px 0', fontSize: '14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {u.rol === 'Tecnico' && (
                        <button
                          type="button"
                          onClick={() => onCreateExceptionForUser?.(u.id)}
                          style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--blue)',
                            background: 'transparent',
                            color: 'var(--blue)',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          Excepción
                        </button>
                      )}

                      {!isSelf && (
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => handleDelete(u)}
                          style={{
                            padding: '5px 8px',
                            borderRadius: '8px',
                            border: '1px solid rgba(211,47,47,0.3)',
                            background: 'transparent',
                            color: '#d32f2f',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: isDeleting ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Eliminar usuario"
                        >
                          <Trash2 size={13} />
                          {isDeleting ? 'Borrando…' : 'Eliminar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
