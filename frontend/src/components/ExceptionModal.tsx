import React, { useState, useEffect } from 'react';

type ExceptionForm = {
  usuario_id: string;
  fecha_vencimiento: string;
  motivo: string;
};

export type TechnicianOption = {
  id: string;
  nombre_completo: string;
  email?: string;
};

type ExceptionModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: { usuario_id: string; fecha_vencimiento: string; motivo?: string }) => Promise<void>;
  saving: boolean;
  error: string | null;
  userId?: string | null;
  userName?: string;
  technicians?: TechnicianOption[];
};

export const ExceptionModal = ({
  open,
  onClose,
  onSubmit,
  saving,
  error,
  userId,
  userName,
  technicians = [],
}: ExceptionModalProps) => {
  const [form, setForm] = useState<ExceptionForm>({
    usuario_id: '',
    fecha_vencimiento: '',
    motivo: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        usuario_id: userId ?? (technicians.length > 0 ? technicians[0].id : ''),
        fecha_vencimiento: '',
        motivo: '',
      });
    }
  }, [open, userId, technicians]);

  if (!open) return null;

  const effectiveUserId = userId || form.usuario_id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveUserId || !form.fecha_vencimiento) return;

    try {
      await onSubmit({
        usuario_id: effectiveUserId,
        fecha_vencimiento: form.fecha_vencimiento,
        motivo: form.motivo.trim() || undefined,
      });
    } catch {
      // Error handled by parent
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
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
      {/* Fondo difuminado interactivo (clic para cerrar) */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'var(--scrim)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        }}
      />

      {/* Ventana Modal sobre el fondo */}
      <div
        style={{
          position: 'relative',
          zIndex: 301,
          background: 'var(--surface)',
          borderRadius: '24px',
          padding: 'clamp(24px, 5vw, 36px)',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 24px 48px rgba(8, 17, 31, 0.2)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              Crear excepción
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Permite la carga de servicios fuera de la ventana del 1 al 5.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              fontSize: '18px',
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {userId && userName ? (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Técnico beneficiario
              </label>
              <div
                style={{
                  marginTop: '6px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                {userName}
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Seleccionar técnico
              </label>
              <select
                required
                value={form.usuario_id}
                onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  outline: 'none',
                  background: 'var(--surface)',
                  width: '100%',
                  marginTop: '6px',
                  cursor: 'pointer',
                }}
              >
                <option value="" disabled>
                  Selecciona un técnico…
                </option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre_completo} ({t.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Fecha límite de vencimiento
            </label>
            <input
              type="date"
              required
              min={today}
              value={form.fecha_vencimiento}
              onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                outline: 'none',
                background: 'var(--glass-bg)',
                width: '100%',
                marginTop: '6px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Motivo o justificación (opcional)
            </label>
            <textarea
              rows={3}
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              placeholder="Ej: Retraso justificado por incapacidad médica..."
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                outline: 'none',
                background: 'var(--glass-bg)',
                width: '100%',
                marginTop: '6px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'var(--warning-bg)',
                border: '1px solid var(--warning-border)',
                color: 'var(--warning-text)',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '11px',
                borderRadius: '11px',
                border: '1px solid var(--border-strong)',
                background: 'var(--surface)',
                color: 'var(--ink)',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !effectiveUserId || !form.fecha_vencimiento}
              style={{
                flex: 1,
                padding: '11px',
                borderRadius: '11px',
                border: 'none',
                background: saving
                  ? 'var(--text-secondary)'
                  : 'linear-gradient(180deg, #0066cc 0%, #0057B8 100%)',
                color: 'white',
                fontWeight: 600,
                fontSize: '14px',
                cursor: saving || !effectiveUserId || !form.fecha_vencimiento ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 10px rgba(0,87,184,0.25)',
              }}
            >
              {saving ? 'Guardando…' : 'Crear excepción'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
