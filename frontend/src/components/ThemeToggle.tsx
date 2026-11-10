import React from 'react';
import { Sun, Moon, Monitor, SunMoon } from 'lucide-react';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import './ThemeToggle.css';

const ORDER: { mode: ThemeMode; label: string; title: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Claro', title: 'Claro (blanco)', Icon: Sun },
  { mode: 'dark', label: 'Oscuro', title: 'Oscuro (negro)', Icon: Moon },
  { mode: 'system', label: 'Sistema', title: 'Según el sistema', Icon: Monitor },
  { mode: 'auto', label: 'Horario', title: 'Según la hora (oscuro 19:00–07:00)', Icon: SunMoon },
];

const HINT: Record<ThemeMode, string> = {
  light: 'Claro · manual',
  dark: 'Oscuro · manual',
  system: 'Sincronizado con el sistema',
  auto: 'Oscuro de 19:00 a 07:00',
};

type Props = {
  /** Versión reducida (solo iconos) para el login. */
  compact?: boolean;
  className?: string;
};

export const ThemeToggle = ({ compact = false, className = '' }: Props) => {
  const { mode, resolved, setMode } = useTheme();
  const index = Math.max(0, ORDER.findIndex((o) => o.mode === mode));

  return (
    <div className={`theme-toggle${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}>
      {!compact && (
        <span className="theme-toggle-label" id="theme-toggle-label">
          Apariencia
        </span>
      )}
      <div
        className="theme-segments"
        role="radiogroup"
        aria-labelledby={compact ? undefined : 'theme-toggle-label'}
        aria-label={compact ? 'Tema de la aplicación' : undefined}
      >
        <span
          className="theme-segment-indicator"
          style={{ transform: `translateX(${index * 100}%)` }}
          aria-hidden="true"
        />
        {ORDER.map(({ mode: m, label, title, Icon }) => {
          const checked = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={title}
              title={title}
              className="theme-segment"
              onClick={() => setMode(m)}
            >
              <Icon size={compact ? 16 : 17} strokeWidth={2} aria-hidden="true" />
              <span className="theme-segment-text">{label}</span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <span className="theme-toggle-hint" aria-live="polite">
          {HINT[mode]}
          <span className="theme-toggle-dot" data-state={resolved} aria-hidden="true" />
        </span>
      )}
    </div>
  );
};