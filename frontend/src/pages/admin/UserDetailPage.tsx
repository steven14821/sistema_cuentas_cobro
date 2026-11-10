import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, KeyRound, Save, UserRound } from 'lucide-react';
import { MainLayout } from '../../layouts/MainLayout';
import { reviewApi, type UserRow } from '../../services/adminApi';
import { useAuth } from '../../context/AuthContext';

type UserForm = Pick<UserRow, 'username' | 'nombre_completo' | 'email' | 'rol'> & { sede: string };

export const UserDetailPage = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isSelf = currentUser?.id === id;
  const [user, setUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState<UserForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [showDeactivation, setShowDeactivation] = useState(false);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const current = await reviewApi.getUser(id);
      setUser(current);
      setForm({
        username: current.username,
        nombre_completo: current.nombre_completo,
        email: current.email,
        rol: current.rol,
        sede: current.sede ?? 'Bucaramanga',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el usuario.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await reviewApi.updateUser(id, {
        username: form.username,
        nombre_completo: form.nombre_completo,
        email: form.email,
        sede: form.rol === 'Tecnico' ? form.sede : null,
      });
      const withRole = form.rol === updated.rol ? updated : await reviewApi.updateUserRole(id, form.rol);
      setUser(withRole);
      setForm({ ...form, rol: withRole.rol, sede: withRole.sede ?? 'Bucaramanga' });
      setNotice('Cambios guardados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!window.confirm('Se reemplazará la contraseña actual. ¿Quieres continuar?')) return;
    setError('');
    try {
      const result = await reviewApi.resetUserPassword(id);
      setPassword(result.password);
      setCopied(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.');
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSavingPassword(true);
    setError('');
    setNotice('');
    try {
      await reviewApi.updateUserPassword(id, newPassword);
      setNewPassword('');
      setConfirmNewPassword('');
      setPassword('');
      setNotice('Contraseña actualizada. Comparte la nueva con el técnico por un canal seguro.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.');
    } finally {
      setSavingPassword(false);
    }
  };

  const toggleActive = async () => {
    if (!user) return;
    if (user.activo && !reason.trim()) {
      setError('Indica el motivo para desactivar este usuario.');
      return;
    }
    try {
      const updated = await reviewApi.toggleUserActive(id, reason);
      setUser(updated);
      setShowDeactivation(false);
      setReason('');
      setNotice(updated.activo ? 'Usuario reactivado.' : 'Usuario desactivado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    }
  };

  if (loading) return <MainLayout><p style={{ color: 'var(--text-secondary)' }}>Cargando usuario…</p></MainLayout>;
  if (!user || !form) {
    return <MainLayout><div style={cardStyle}><p>{error || 'Usuario no encontrado.'}</p><button onClick={() => navigate('/admin/review')}>Volver a usuarios</button></div></MainLayout>;
  }

  return (
    <MainLayout>
      <div style={{ maxWidth: 850, margin: '0 auto' }}>
        <button type="button" onClick={() => navigate('/admin/review')} style={backStyle}><ArrowLeft size={16} /> Volver a revisión</button>
        <section style={{ ...cardStyle, marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={avatarStyle}><UserRound size={22} /></span>
              <div>
                <h1 style={{ margin: 0, fontSize: 26 }}>{user.nombre_completo}</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>@{user.username} · {user.activo ? 'Activo' : 'Inactivo'}</p>
              </div>
            </div>
            <button type="button" disabled={isSelf && user.activo} onClick={() => user.activo ? setShowDeactivation(true) : void toggleActive()} style={{ ...(user.activo ? dangerButton : primaryButton), opacity: isSelf && user.activo ? .55 : 1 }}>
              {user.activo ? 'Desactivar usuario' : 'Reactivar usuario'}
            </button>
          </div>

          {error && <div role="alert" style={messageStyle('var(--danger-bg)', 'var(--danger-text)')}>{error}</div>}
          {notice && <div role="status" style={messageStyle('var(--success-bg)', 'var(--success-text)')}>{notice}</div>}
          {user.motivo_inactivacion && (
            <div style={messageStyle('var(--warning-bg)', 'var(--warning-text)')}>Último motivo de desactivación: {user.motivo_inactivacion}</div>
          )}

          <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
            <Field label="Nombre completo"><input required value={form.nombre_completo} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} /></Field>
            <Field label="Nombre de usuario"><input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Correo electrónico"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Rol">
              <select disabled={isSelf} value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as UserForm['rol'] })}>
                <option value="Tecnico">Técnico</option><option value="Admin">Admin</option>
              </select>
            </Field>
            {form.rol === 'Tecnico' && (
              <Field label="Sede">
                <select value={form.sede} onChange={(e) => setForm({ ...form, sede: e.target.value })}>
                  <option value="Bucaramanga">Bucaramanga</option><option value="Cucuta">Cúcuta</option>
                </select>
              </Field>
            )}
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button type="submit" disabled={saving} style={primaryButton}><Save size={15} /> {saving ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </form>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 28, paddingTop: 22 }}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Acceso</h2>
            {user.rol === 'Tecnico' && (
              <>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 14px', fontSize: 14 }}>Define una contraseña nueva para este técnico. Compártela por un canal seguro.</p>
                <form onSubmit={(event) => void savePassword(event)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, alignItems: 'end', marginBottom: 18 }}>
                  <Field label="Nueva contraseña">
                    <input
                      required
                      type="password"
                      autoComplete="new-password"
                      minLength={4}
                      maxLength={72}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </Field>
                  <Field label="Confirmar contraseña">
                    <input
                      required
                      type="password"
                      autoComplete="new-password"
                      minLength={4}
                      maxLength={72}
                      value={confirmNewPassword}
                      onChange={(event) => setConfirmNewPassword(event.target.value)}
                    />
                  </Field>
                  <button type="submit" disabled={savingPassword || !newPassword || newPassword !== confirmNewPassword} style={{ ...primaryButton, opacity: savingPassword || !newPassword || newPassword !== confirmNewPassword ? .55 : 1 }}>
                    <KeyRound size={15} /> {savingPassword ? 'Guardando…' : 'Cambiar contraseña'}
                  </button>
                </form>
              </>
            )}
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 14px', fontSize: 14 }}>También puedes generar una contraseña aleatoria para compartirla con el usuario.</p>
            <button type="button" onClick={() => void resetPassword()} style={secondaryButton}><KeyRound size={15} /> Generar contraseña aleatoria</button>
            {password && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
                <code style={{ padding: '10px 12px', background: 'var(--surface-3)', borderRadius: 8, fontSize: 16 }}>{password}</code>
                <button type="button" onClick={async () => { await navigator.clipboard.writeText(password); setCopied(true); }} style={secondaryButton}>
                  <Copy size={14} /> {copied ? 'Copiada' : 'Copiar'}
                </button>
              </div>
            )}
          </div>
        </section>

        {showDeactivation && (
          <div style={modalBackdrop}>
            <section role="dialog" aria-modal="true" aria-labelledby="deactivation-title" style={dialogStyle}>
              <h2 id="deactivation-title" style={{ marginTop: 0 }}>Desactivar {user.nombre_completo}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>El usuario perderá acceso de inmediato. Registra el motivo para conservarlo en su ficha.</p>
              <textarea required value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Motivo de desactivación" style={{ ...fieldControl, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={() => setShowDeactivation(false)} style={secondaryButton}>Cancelar</button>
                <button type="button" disabled={!reason.trim()} onClick={() => void toggleActive()} style={dangerButton}>Confirmar desactivación</button>
              </div>
            </section>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>
    {label}
    {React.cloneElement(children as React.ReactElement, { style: fieldControl })}
  </label>
);
const fieldControl: React.CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', color: 'var(--ink)', fontSize: 14, fontFamily: 'inherit' };
const cardStyle: React.CSSProperties = { background: 'var(--surface)', borderRadius: 20, padding: 26, border: '1px solid var(--border)', boxShadow: '0 8px 26px rgba(0,0,0,.04)' };
const primaryButton: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 0, borderRadius: 9, padding: '11px 14px', background: 'var(--blue-solid)', color: 'var(--on-accent)', fontWeight: 650, cursor: 'pointer' };
const secondaryButton: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '10px 13px', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 600, cursor: 'pointer' };
const dangerButton: React.CSSProperties = { ...primaryButton, background: 'var(--danger-solid)' };
const backStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-strong)', borderRadius: 9, padding: '9px 12px', background: 'var(--surface)', cursor: 'pointer', color: 'var(--ink)' };
const avatarStyle: React.CSSProperties = { width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 15, background: 'var(--info-bg)', color: 'var(--blue)' };
const messageStyle = (background: string, color: string): React.CSSProperties => ({ padding: '11px 13px', marginBottom: 14, borderRadius: 9, background, color, fontSize: 14 });
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 500, display: 'grid', placeItems: 'center', padding: 16, background: 'var(--scrim)' };
const dialogStyle: React.CSSProperties = { width: 'min(100%, 440px)', background: 'var(--surface)', borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,.2)' };
