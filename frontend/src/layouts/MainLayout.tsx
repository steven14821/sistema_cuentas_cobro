import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EmLogo } from '../components/EmLogo';
import {
  Home,
  ClipboardCheck,
  BarChart3,
  Receipt,
  LogOut,
  Menu,
  X,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { UserRow } from '../services/adminApi';

const searchItemStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 12px',
  color: 'var(--text-secondary)',
  background: 'white',
  fontSize: 12,
};

export const MainLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [techSearch, setTechSearch] = useState('');
  const [technicians, setTechnicians] = useState<UserRow[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // El técnico SOLO ve su portal. Las secciones admin se ocultan por completo.
  const isAdmin = user?.role === 'admin';
  const navItems = isAdmin
    ? [
        { icon: Home, label: 'Panel Principal', path: '/dashboard' },
        { icon: ClipboardCheck, label: 'Revisión Admin', path: '/admin/review' },
        { icon: BarChart3, label: 'Reportes', path: '/reports' },
      ]
    : [{ icon: Receipt, label: 'Mis Cuentas de Cobro', path: '/technician' }];

  const homePath = isAdmin ? '/dashboard' : '/technician';

  useEffect(() => {
    if (!isAdmin || !techSearch.trim()) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const users = await apiFetch<UserRow[]>('/admin/users');
        if (active) setTechnicians(users.filter((candidate) => candidate.rol === 'Tecnico'));
      } catch {
        if (active) setTechnicians([]);
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isAdmin, techSearch]);

  const searchResults = technicians.filter((candidate) =>
    `${candidate.nombre_completo} ${candidate.username} ${candidate.email}`
      .toLocaleLowerCase()
      .includes(techSearch.trim().toLocaleLowerCase()),
  ).slice(0, 6);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Navega y cierra el cajón móvil.
  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <div className="app-shell" style={{
      display: 'flex',
      width: '100%',
      backgroundColor: '#F5F5F7',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden'
    }}>
      {/* Botón de menú (solo móvil, ver globals.css) */}
      <button
        className="menu-toggle"
        onClick={() => setMenuOpen(o => !o)}
        aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={menuOpen}
      >
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay del cajón (solo móvil, solo abierto) */}
      {menuOpen && (
        <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />
      )}

      {/* Sidebar - Apple Style (cajón deslizante en móvil) */}
      <aside className={`app-sidebar${menuOpen ? ' open' : ''}`} style={{
        width: '260px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 16px',
        gap: '32px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 12px',
          marginBottom: '20px',
          cursor: 'pointer'
        }} onClick={() => go(homePath)}>
          <EmLogo height={32} radius={8} />
        </div>

        {user && (
          <div style={{ padding: '0 12px', marginBottom: '8px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {isAdmin ? 'Administrativo' : 'Técnico'}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>{user.name}</div>
          </div>
        )}

        {isAdmin && (
          <div style={{ position: 'relative', padding: '0 4px', marginTop: -18 }}>
            <label htmlFor="technician-quick-search" style={{ display: 'block', margin: '0 8px 7px', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Buscar técnico
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10, border: '1px solid rgba(0,0,0,.12)', background: 'white' }}>
              <Search size={15} color="var(--text-secondary)" />
              <input
                id="technician-quick-search"
                value={techSearch}
                onChange={(event) => { setTechSearch(event.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                placeholder="Nombre, usuario o correo"
                autoComplete="off"
                style={{ width: '100%', minWidth: 0, border: 0, outline: 0, fontSize: 12, color: 'var(--ink)', background: 'transparent' }}
              />
            </div>
            {searchOpen && techSearch.trim() && (
              <div role="listbox" aria-label="Resultados de técnicos" style={{ position: 'absolute', zIndex: 30, top: '100%', left: 4, right: 4, marginTop: 6, overflow: 'hidden', borderRadius: 12, background: 'white', boxShadow: '0 14px 35px rgba(0,0,0,.15)', border: '1px solid #e5e7eb' }}>
                {searchLoading ? <div style={searchItemStyle}>Buscando…</div> : searchResults.length === 0 ? <div style={searchItemStyle}>No se encontraron técnicos.</div> : searchResults.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="option"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { setTechSearch(''); setSearchOpen(false); go(`/admin/users/${candidate.id}`); }}
                    style={{ ...searchItemStyle, width: '100%', border: 0, textAlign: 'left', cursor: 'pointer' }}
                  >
                    <strong style={{ display: 'block', fontSize: 12, color: 'var(--ink)' }}>{candidate.nombre_completo}</strong>
                    <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--text-secondary)' }}>@{candidate.username} · {candidate.sede ?? 'Sin sede'} · {candidate.activo ? 'Activo' : 'Inactivo'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(item => (
            <NavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              active={location.pathname === item.path}
              onNavigate={go}
            />
          ))}
        </nav>

        <div style={{ marginTop: 'auto', padding: '0 12px' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: 'rgba(0,0,0,0.04)',
              color: 'var(--ink)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <LogOut size={15} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-main" style={{
        flex: 1,
        overflowY: 'auto',
        position: 'relative',
        minWidth: 0
      }}>
        {children}
      </main>
    </div>
  );

};

const NavItem = ({ icon: Icon, label, path, active = false, onNavigate }: {
  icon: LucideIcon;
  label: string;
  path: string;
  active?: boolean;
  onNavigate: (path: string) => void;
}) => (
  <div
    onClick={() => onNavigate(path)}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 12px',
      borderRadius: '10px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      color: 'var(--ink)',
      fontWeight: active ? '600' : '400',
      fontSize: '14px',
      backgroundColor: active ? 'rgba(0, 87, 184, 0.08)' : 'transparent'
    }}
    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'}
    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = active ? 'rgba(0, 87, 184, 0.08)' : 'transparent'}
  >
    <Icon size={18} strokeWidth={2} style={{ flexShrink: 0, color: active ? 'var(--blue)' : 'var(--text-secondary)' }} />
    <span>{label}</span>
  </div>
);
