import React from 'react';
import type { EstadoServicio } from '../services/technicianApi';

export type EstaBadgeStyle = EstadoServicio | 'Pendiente';

export const ESTADO_BADGE_STYLES: Record<EstaBadgeStyle, { bg: string; color: string }> = {
  Aprobado: { bg: 'var(--success-bg)', color: 'var(--success-text)' },
  Rechazado: { bg: 'var(--danger-bg)', color: 'var(--danger-text)' },
  Observado: { bg: 'var(--warning-bg)', color: 'var(--warning-text)' },
  Pendiente: { bg: 'var(--info-bg)', color: 'var(--blue)' },
};

export const estadoBadgeStyle = (estado?: EstaBadgeStyle) =>
  ESTADO_BADGE_STYLES[estado ?? 'Pendiente'] ?? ESTADO_BADGE_STYLES.Pendiente;

type EstadoBadgeProps = {
  estado: EstadoServicio;
  /** Estilo compacto (radius 6, padding menor) usado en tablas densas. */
  compact?: boolean;
  /** Texto a mostrar; por defecto el propio estado. */
  label?: string;
};

export const EstadoBadge = ({ estado, compact = false, label }: EstadoBadgeProps) => {
  const s = estadoBadgeStyle(estado);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: compact ? '4px 8px' : '4px 10px',
        borderRadius: compact ? '6px' : '8px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
      }}
    >
      {label ?? estado}
    </span>
  );
};
