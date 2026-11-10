import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** Preferencia elegida por el usuario. */
  mode: ThemeMode;
  /** Tema realmente aplicado (light/dark). */
  resolved: ResolvedTheme;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'em_theme_mode';
const MODES: ThemeMode[] = ['light', 'dark', 'system', 'auto'];

// Modo "auto": oscuro de 19:00 a 07:00, claro el resto del día.
const DARK_START_HOUR = 19;
const DARK_END_HOUR = 7;

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const readStoredMode = (): ThemeMode => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (MODES as string[]).includes(raw)) return raw as ThemeMode;
  } catch {
    // almacenamiento no disponible (modo privado) — usar por defecto
  }
  return 'auto';
};

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const isNight = (date = new Date()): boolean => {
  const h = date.getHours();
  return h >= DARK_START_HOUR || h < DARK_END_HOUR;
};

export const resolveTheme = (mode: ThemeMode): ResolvedTheme => {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return isNight() ? 'dark' : 'light';
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  // "tick" fuerza recálculo del modo auto sin depender de un render externo.
  const [, setTick] = useState(0);
  const [sysDark, setSysDark] = useState(systemPrefersDark);

  // Seguir al sistema operativo cuando el modo es "system".
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => setSysDark(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // Reevaluar el horario cada 30 s y al volver a la pestaña (el equipo pudo dormir).
  useEffect(() => {
    if (mode !== 'auto') return;
    const bump = () => setTick((t) => (t + 1) % 1_000_000);
    const id = window.setInterval(bump, 30_000);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
    };
  }, [mode]);

  // Cálculo directo (no memoizado): el "tick" del modo auto debe poder
  // refrescar el resultado al cruzar el límite de horario.
  const resolved: ResolvedTheme = mode === 'system' ? (sysDark ? 'dark' : 'light') : resolveTheme(mode);

  // Aplicar al <html> y sincronizar la barra de color del navegador/móvil.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0B0E13' : '#0057b8');
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // sin persistencia: el tema sigue funcionando en memoria
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, isDark: resolved === 'dark', setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
};