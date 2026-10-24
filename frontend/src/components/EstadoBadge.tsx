import React from 'react';
import type { EstadoServicio } from '../services/technicianApi';

export type EstaBadgeStyle = EstadoServicio | 'Pendiente';

export const ESTADO_BADGE_STYLES: Record<EstaBadgeStyle, { bg: string; color: string }> = {
  Aprobado: { bg: '#e2f9e1', color: '#2d8a39' },
  Rechazado: { bg: '#ffebeb', color: '#d32f2f' },
  Observado: { bg: '#fff6e0', color: '#7a5c00' },
  Pendiente: { bg: '#f0f7ff', color: '#0057B8' },
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
