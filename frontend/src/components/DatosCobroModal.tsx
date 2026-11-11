import React, { useState } from 'react';
import type { DatosCobroApi } from '../services/technicianApi';

interface DatosCobroModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (datos: DatosCobroApi) => Promise<void>;
  initialData?: DatosCobroApi | null;
}

export const DatosCobroModal: React.FC<DatosCobroModalProps> = ({
  open,
  onClose,
  onSave,
  initialData,
}) => {
  const [banco] = useState('Bancolombia');
  const [numeroCuenta, setNumeroCuenta] = useState(initialData?.numero_cuenta || '');
  const [nit, setNit] = useState(initialData?.nit || '');
  const [telefono, setTelefono] = useState(initialData?.telefono || '');
  const [lugarExpedicion, setLugarExpedicion] = useState(initialData?.lugar_expedicion || 'Girón – Santander');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numeroCuenta.trim()) {
      setError('Por favor ingresa tu número de cuenta de ahorros Bancolombia.');
      return;
    }
    if (!nit.trim()) {
      setError('Por favor ingresa tu NIT o número de cédula.');
      return;
    }
    if (!telefono.trim()) {
      setError('Por favor ingresa tu número de teléfono.');
      return;
    }
    if (!lugarExpedicion.trim()) {
      setError('Por favor ingresa tu ciudad / departamento (lugar de expedición).');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        banco: 'Bancolombia',
        numero_cuenta: numeroCuenta.trim(),
        nit: nit.trim(),
        telefono: telefono.trim(),
        lugar_expedicion: lugarExpedicion.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los datos.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(3px)',
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '28px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        }}
      >
        <h3 style={{ margin: '0 0 6px 0', fontSize: '20px', fontWeight: 700, color: '#08111f' }}>
          Información para Cuenta de Cobro
        </h3>
        <p style={{ margin: '0 0 18px 0', fontSize: '13px', color: '#666' }}>
          Ingresa tus datos una sola vez. Se guardarán encriptados y seguros para generar automáticamente el PDF de todas tus cuentas de cobro.
        </p>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '10px',
              fontSize: '13px',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#333' }}>
              Banco
            </label>
            <input
              type="text"
              value={banco}
              disabled
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                backgroundColor: '#f5f5f5',
                fontSize: '14px',
                color: '#555',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#333' }}>
              Número de Cuenta de Ahorros Bancolombia *
            </label>
            <input
              type="text"
              placeholder="Ej: 91280045981"
              value={numeroCuenta}
              onChange={(e) => setNumeroCuenta(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#333' }}>
              NIT o Cédula (con dígito de verificación si aplica) *
            </label>
            <input
              type="text"
              placeholder="Ej: 1097783287-1"
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#333' }}>
              Ciudad y Departamento (Lugar expedición) *
            </label>
            <input
              type="text"
              placeholder="Ej: Girón – Santander"
              value={lugarExpedicion}
              onChange={(e) => setLugarExpedicion(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#333' }}>
              Teléfono de Contacto *
            </label>
            <input
              type="text"
              placeholder="Ej: 318 4490350"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '9px 16px',
                borderRadius: '10px',
                border: '1px solid #ccc',
                background: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: 'none',
                background: '#0057b8',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Guardando...' : 'Guardar y Continuar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
