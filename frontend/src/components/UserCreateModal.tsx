import React, { useEffect, useState } from 'react';

type UserForm = {
  username: string;
  nombre_completo: string;
  email: string;
  password: string;
  confirmPassword: string;
  generatePassword: boolean;
  rol: 'Tecnico' | 'Admin';
  sede: 'Bucaramanga' | 'Cucuta';
};

type ModalApi = {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: UserForm) => Promise<{ generatedPassword?: string; created?: boolean } | void>;
  saving: boolean;
  error: string | null;
  success: boolean;
};

type UserCreateModalProps = ModalApi & {
  // Callback externo opcional para refrescar listado padre
  onCreated?: () => void;
};

export const UserCreateModal = ({
  open,
  onClose,
  onSubmit,
  saving,
  error,
  success,
  onCreated,
}: UserCreateModalProps) => {
  const [form, setForm] = useState<UserForm>({
    username: '',
    nombre_completo: '',
    email: '',
    password: '',
    confirmPassword: '',
    generatePassword: false,
    rol: 'Tecnico',
    sede: 'Bucaramanga',
  });
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    if (!open) {
      setGeneratedPassword('');
      setCopied(false);
      setCreated(false);
      setForm({
        username: '',
        nombre_completo: '',
        email: '',
        password: '',
        confirmPassword: '',
        generatePassword: false,
        rol: 'Tecnico',
        sede: 'Bucaramanga',
      });
    }
  }, [open]);
  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.generatePassword && form.password !== form.confirmPassword) {
      // El caller gestiona el error externo si lo desea; dejamos que lo maneje.
      return;
    }
    try {
      const result = await onSubmit(form);
      if (result && result.generatedPassword) setGeneratedPassword(result.generatedPassword);
      if (result && result.created) setCreated(true);
    } catch {
      // El caller debería setear error externo; si no, lo dejamos pasar.
    }
  };

  const copyPassword = async () => {
    await navigator.clipboard.writeText(generatedPassword);
    setCopied(true);
  };

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
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 301,
          background: 'white',
          borderRadius: '24px',
          padding: 'clamp(24px, 6vw, 40px)',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 24px 48px rgba(8, 17, 31, 0.2)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Nuevo usuario
          </h2>
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
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {generatedPassword ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '14px', borderRadius: '12px', background: '#ecfdf3', color: '#166534', fontSize: '14px' }}>
              Usuario creado. Copia esta contraseña y compártela con el usuario; no volverá a mostrarse.
            </div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Contraseña generada
              <input readOnly value={generatedPassword} style={{ ...credentialInputStyle, marginTop: '6px' }} />
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={copyPassword} style={buttonStyle}>{copied ? 'Copiada' : 'Copiar contraseña'}</button>
              <button type="button" onClick={onClose} style={{ ...buttonStyle, background: 'var(--blue)', color: 'white' }}>Listo</button>
            </div>
          </div>
        ) : created ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '14px', borderRadius: '12px', background: '#ecfdf3', color: '#166534', fontSize: '14px' }}>Usuario creado correctamente.</div>
            <button type="button" onClick={onClose} style={{ ...buttonStyle, background: 'var(--blue)', color: 'white' }}>Listo</button>
          </div>
        ) : <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Nombre de usuario</label>
              <input
                type="text"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.1)',
                  fontSize: '15px',
                  outline: 'none',
                  background: 'rgba(255,255,255,0.85)',
                }}
              />
            </div>
            <div style={{ width: '130px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Rol</label>
              <select
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value as 'Tecnico' | 'Admin' })}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.1)',
                  fontSize: '15px',
                  outline: 'none',
                  background: 'rgba(255,255,255,0.85)',
                  color: 'var(--ink)',
                }}
              >
                <option value="Tecnico">Técnico</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          </div>

          {form.rol === 'Tecnico' && (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Sede del Técnico (Determina el prefijo BUC o CUC)
              </label>
              <select
                value={form.sede}
                onChange={(e) => setForm({ ...form, sede: e.target.value as 'Bucaramanga' | 'Cucuta' })}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(0,0,0,0.1)',
                  fontSize: '15px',
                  outline: 'none',
                  background: 'rgba(255,255,255,0.85)',
                  width: '100%',
                  marginTop: '6px',
                  color: 'var(--ink)',
                  fontWeight: 600,
                }}
              >
                <option value="Bucaramanga">Sede Bucaramanga (Prefijo BUC-)</option>
                <option value="Cucuta">Sede Cúcuta (Prefijo CUC-)</option>
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Nombre completo</label>
            <input
              type="text"
              required
              value={form.nombre_completo}
              onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '15px',
                outline: 'none',
                background: 'rgba(255,255,255,0.85)',
                width: '100%',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Correo electrónico</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '15px',
                outline: 'none',
                background: 'rgba(255,255,255,0.85)',
                width: '100%',
              }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px', color: 'var(--ink)' }}>
            <input
              type="checkbox"
              checked={form.generatePassword}
              onChange={(e) => setForm({ ...form, generatePassword: e.target.checked, password: '', confirmPassword: '' })}
            />
            Generar contraseña aleatoria (se mostrará una sola vez)
          </label>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Contraseña</label>
            <input
              type="password"
              required={!form.generatePassword}
              minLength={form.generatePassword ? undefined : 4}
              disabled={form.generatePassword}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '15px',
                outline: 'none',
                background: form.generatePassword ? '#f1f5f9' : 'rgba(255,255,255,0.85)',
                width: '100%',
              }}
            />
          </div>

          {!form.generatePassword && <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Confirmar contraseña</label>
            <input
              type="password"
              required
              minLength={4}
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(0,0,0,0.1)',
                fontSize: '15px',
                outline: 'none',
                background: 'rgba(255,255,255,0.85)',
                width: '100%',
              }}
            />
          </div>}

          {error && (
            <div
              style={{
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

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '11px',
                borderRadius: '11px',
                border: '1px solid rgba(0,0,0,0.12)',
                background: 'white',
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
              disabled={saving || (!form.generatePassword && form.password !== form.confirmPassword)}
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
                cursor: saving || (!form.generatePassword && form.password !== form.confirmPassword) ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 10px rgba(0,87,184,0.25)',
              }}
            >
              {saving ? 'Guardando…' : 'Crear usuario'}
            </button>
          </div>
        </form>}
      </div>
    </div>
  );
};

const credentialInputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '12px',
  border: '1px solid #cbd5e1',
  borderRadius: '9px',
  color: 'var(--ink)',
  fontSize: '16px',
};

const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: '11px',
  borderRadius: '11px',
  border: '1px solid rgba(0,0,0,0.12)',
  background: 'white',
  color: 'var(--ink)',
  fontWeight: 600,
  cursor: 'pointer',
};
