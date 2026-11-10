import React, { useEffect, useState } from 'react';
import type { EstadoServicio } from '../services/technicianApi';

type ReviewModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit: (status: EstadoServicio, observacion: string) => Promise<void>;
  saving: boolean;
  error: string | null;
};

export const ReviewModal = ({
  open,
  title,
  subtitle,
  onClose,
  onSubmit,
  saving,
  error,
}: ReviewModalProps) => {
  const [observacion, setObservacion] = useState('');

  useEffect(() => {
    if (open) setObservacion('');
  }, [open]);

  if (!open) return null;

  const submit = async (status: EstadoServicio) => {
    await onSubmit(status, observacion.trim());
  };

  const acciones: { status: EstadoServicio; label: string; color: string; bg: string }[] = [
    { status: 'Aprobado', label: 'Aprobar', color: 'var(--on-accent)', bg: 'var(--success-solid)' },
    { status: 'Observado', label: 'Observar', color: 'var(--warning-text)', bg: 'var(--warning-bg)' },
    { status: 'Rechazado', label: 'Rechazar', color: 'var(--on-accent)', bg: 'var(--danger-solid)' },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'var(--scrim)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          zIndex: 200,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--surface)',
          borderRadius: '24px',
          padding: 'clamp(24px, 6vw, 36px)',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 24px 48px rgba(8, 17, 31, 0.18)',
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 201,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '18px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
          Observación (opcional)
        </label>
        <textarea
          rows={3}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder="Comentario para el técnico…"
          style={{
            marginTop: '6px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            fontSize: '15px',
            outline: 'none',
            background: 'var(--glass-bg)',
            width: '100%',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />

        {error && (
          <div
            style={{
              marginTop: '12px',
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

        <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
          {acciones.map((a) => (
            <button
              key={a.status}
              type="button"
              disabled={saving}
              onClick={() => submit(a.status)}
              style={{
                flex: 1,
                padding: '11px',
                borderRadius: '11px',
                border: a.status === 'Observado' ? '1px solid var(--warning-border)' : 'none',
                background: saving ? 'var(--text-secondary)' : a.bg,
                color: a.color,
                fontWeight: 600,
                fontSize: '14px',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
