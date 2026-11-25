import React, { useEffect, useState } from 'react';
import { FileDown, X } from 'lucide-react';

interface PdfDatosModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (datos: { nit: string; telefono: string }) => void;
}

const STORAGE_KEY_NIT = 'cuenta_cobro_pdf_nit';
const STORAGE_KEY_TEL = 'cuenta_cobro_pdf_telefono';

export const PdfDatosModal: React.FC<PdfDatosModalProps> = ({ open, onClose, onConfirm }) => {
  const [nit, setNit] = useState('');
  const [telefono, setTelefono] = useState('');

  useEffect(() => {
    if (open) {
      setNit(localStorage.getItem(STORAGE_KEY_NIT) ?? '');
      setTelefono(localStorage.getItem(STORAGE_KEY_TEL) ?? '');
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNit = nit.trim();
    const cleanTel = telefono.trim();
    if (!cleanNit || !cleanTel) return;
    localStorage.setItem(STORAGE_KEY_NIT, cleanNit);
    localStorage.setItem(STORAGE_KEY_TEL, cleanTel);
    onConfirm({ nit: cleanNit, telefono: cleanTel });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface, #fff)',
          borderRadius: '14px',
          border: '1px solid var(--border, #e2e8f0)',
          width: '100%',
          maxWidth: '420px',
          padding: '22px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileDown size={18} style={{ color: 'var(--brand-primary, #2563eb)' }} />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
              Datos para el PDF
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #64748b)',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>
          Ingresa el NIT / Cédula y el teléfono que aparecerán en la cuenta de cobro.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #0f172a)' }}>
              NIT o Cédula
            </label>
            <input
              type="text"
              required
              value={nit}
              onChange={(e) => setNit(e.target.value)}
              placeholder="Ej: 1098765432"
              autoFocus
              style={{
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-strong, #cbd5e1)',
                background: 'var(--surface, #fff)',
                color: 'var(--ink, #0f172a)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink, #0f172a)' }}>
              Teléfono
            </label>
            <input
              type="tel"
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 3001234567"
              style={{
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-strong, #cbd5e1)',
                background: 'var(--surface, #fff)',
                color: 'var(--ink, #0f172a)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '9px',
                border: '1px solid var(--border, #e2e8f0)',
                background: 'var(--surface, #fff)',
                color: 'var(--ink, #0f172a)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!nit.trim() || !telefono.trim()}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '9px',
                border: 'none',
                background: 'var(--brand-primary, #2563eb)',
                color: '#fff',
                fontWeight: 600,
                cursor: !nit.trim() || !telefono.trim() ? 'not-allowed' : 'pointer',
                opacity: !nit.trim() || !telefono.trim() ? 0.6 : 1,
                fontSize: '13px',
              }}
            >
              Generar PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
