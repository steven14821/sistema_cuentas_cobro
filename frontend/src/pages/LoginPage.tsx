import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EmLogo } from '../components/EmLogo';
import { ThemeToggle } from '../components/ThemeToggle';

type LoginForm = {
  username: string;
  password: string;
};

export const LoginPage = () => {
  const [form, setForm] = useState<LoginForm>({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const homeFor = (role: string) => (role === 'admin' ? '/admin/review' : '/technician');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.username.trim()) {
      setError('Ingresa tu nombre de usuario.');
      return;
    }
    if (!form.password) {
      setError('Ingresa tu contraseña.');
      return;
    }

    setLoading(true);

    try {
      const logged = await login(form.username.trim(), form.password);

      // Al usuario que inició sesión le redirigimos según su rol real.
      navigate(homeFor(logged.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (

    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        background: 'radial-gradient(circle at top left, var(--surface) 0%, var(--bg) 100%)',
      }}
    >
      <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 10 }}>
        <ThemeToggle compact />
      </div>
      <div
        style={{
          position: 'relative',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(30px) saturate(180%)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          border: '1px solid var(--glass-border)',
          borderRadius: '38px',
          padding: 'clamp(28px, 8vw, 48px) clamp(20px, 7vw, 40px)',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <EmLogo height={64} radius={12} />

          <p
            style={{
              fontSize: '17px',
              color: 'var(--text-secondary)',
              margin: 0,
              fontWeight: '400',
              letterSpacing: '-0.01em',
            }}
          >
            Gestión de Cuentas y Cobros
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '14px',
              backgroundColor: 'var(--warning-bg)',
              border: '1px solid var(--warning-border)',
              color: 'var(--warning-text)',
              fontSize: '14px',
              fontWeight: '500',
              textAlign: 'left',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
            <input
              type="text"
              placeholder="Nombre de usuario o correo"
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              style={{
                padding: '16px 20px',
                borderRadius: '14px',
                border: '1px solid var(--border)',
                fontSize: '17px',
                backgroundColor: 'var(--surface)',
                outline: 'none',
                transition: 'all 0.2s ease',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                width: '100%',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--blue)';
                e.target.style.boxShadow = '0 0 0 4px rgba(0, 87, 184, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                style={{
                  padding: '16px 44px 16px 20px',
                  borderRadius: '14px',
                  border: '1px solid var(--border)',
                  fontSize: '17px',
                  backgroundColor: 'var(--surface)',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                  width: '100%',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--blue)';
                  e.target.style.boxShadow = '0 0 0 4px rgba(0, 87, 184, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--border)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  borderRadius: '8px',
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff size={19} />
                ) : (
                  <Eye size={19} />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !form.username.trim() || !form.password}
            onMouseDown={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)';
            }}
            onMouseUp={() => {
              const btn = document.activeElement as HTMLButtonElement;
              if (btn) btn.style.transform = '';
            }}
            onMouseLeave={() => {
              const btn = document.activeElement as HTMLButtonElement;
              if (btn) btn.style.transform = '';
            }}
            style={{
              padding: '16px',
              borderRadius: '14px',
              border: 'none',
              backgroundColor: loading
                ? 'var(--text-secondary)'
                : 'var(--blue-solid)',
              color: 'var(--on-accent)',
              fontSize: '17px',
              fontWeight: '600',
              cursor: loading || !form.username.trim() || !form.password ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: loading ? 'scale(1)' : 'scale(1)',
              boxShadow: '0 4px 12px rgba(0, 82, 204, 0.3)',
              marginTop: '6px',
              letterSpacing: '0.01em',
            }}
          >
            {loading ? (
              <span style={{ display: 'inline-block', gap: '8px', alignItems: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: 'white',
                    animation: 'spin 0.7s linear infinite',
                    marginRight: '8px',
                    verticalAlign: 'middle',
                  }}
                />
                Ingresando...
              </span>
            ) : (
              'Continuar'
            )}
          </button>
        </form>

        <div
          style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            marginTop: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >

          <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '8px' }}>
            © 2026 E&amp;M Electronic Solutions
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
