import { describe, expect, it } from 'vitest';
import { auditServiceTariff, summarizeTariffAudits } from './account-audit';

describe('account tariff audit', () => {
  it('matches a service against the current standard tariff', () => {
    const result = auditServiceTariff({
      numero_orden: 'BUC-12345',
      valor_cobrado: 50_000,
      valor_estandar: 50_000,
      tipo_servicio_nombre: 'Instalación',
    });

    expect(result).toMatchObject({
      status: 'match',
      expected: 50_000,
      difference: 0,
    });
  });

  it('includes documented collection extras in the expected amount', () => {
    const result = auditServiceTariff({
      numero_orden: 'BUC-12345',
      descripcion_especifica: 'Recolección: Puertas desmontadas: 2, Ayudante: sí (motivo: acceso, fotos del motivo: 1)',
      valor_cobrado: 80_000,
      valor_estandar: 50_000,
      tipo_servicio_nombre: 'Recolección Nevecon',
    });

    expect(result).toMatchObject({
      status: 'match',
      expected: 80_000,
    });
  });

  it('reports the amount difference when a service does not match the standard', () => {
    const result = auditServiceTariff({
      numero_orden: 'CUC-12345',
      valor_cobrado: 60_000,
      valor_estandar: 50_000,
      tipo_servicio_nombre: 'Diagnóstico',
    });

    expect(result).toMatchObject({
      status: 'mismatch',
      expected: 50_000,
      difference: 10_000,
    });
  });

  it('does not guess when recorded extras do not fit the service rules', () => {
    const result = auditServiceTariff({
      numero_orden: 'BUC-12345',
      descripcion_especifica: 'Puertas desmontadas: 2',
      valor_cobrado: 70_000,
      valor_estandar: 50_000,
      tipo_servicio_nombre: 'Instalación',
    });

    expect(result.status).toBe('manual_review');
  });

  it('leaves transfers for manual review and summarizes all audit states', () => {
    const transfer = auditServiceTariff({
      numero_orden: 'T-CUC-12345',
      valor_cobrado: 75_000,
      valor_estandar: 5_000,
      tipo_servicio_nombre: 'Traslado',
    });
    const matched = auditServiceTariff({
      numero_orden: 'BUC-12346',
      valor_cobrado: 50_000,
      valor_estandar: 50_000,
      tipo_servicio_nombre: 'Instalación',
    });

    expect(transfer.status).toBe('manual_review');
    expect(summarizeTariffAudits([transfer, matched])).toEqual({
      coincidencias: 1,
      diferencias: 0,
      revision_manual: 1,
    });
  });
});
