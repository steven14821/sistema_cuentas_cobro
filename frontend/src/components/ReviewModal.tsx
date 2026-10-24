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
    { status: 'Aprobado', label: 'Aprobar', color: 'white', bg: '#2d8a39' },
    { status: 'Observado', label: 'Observar', color: '#7a5c00', bg: '#fff6e0' },
    { status: 'Rechazado', label: 'Rechazar', color: 'white', bg: '#d32f2f' },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.35)',
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
          background: 'white',
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
            border: '1px solid rgba(0,0,0,0.1)',
            fontSize: '15px',
            outline: 'none',
            background: 'rgba(255,255,255,0.85)',
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
              background: 'rgba(245,196,0,0.15)',
              border: '1px solid rgba(245,196,0,0.45)',
              color: '#7a5c00',
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
                border: a.status === 'Observado' ? '1px solid rgba(245,196,0,0.5)' : 'none',
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
