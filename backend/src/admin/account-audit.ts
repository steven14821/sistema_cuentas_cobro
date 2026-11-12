export type TariffAuditStatus = 'match' | 'mismatch' | 'manual_review';

export type TariffAuditResult = {
  status: TariffAuditStatus;
  charged: number;
  expected: number | null;
  difference: number | null;
  explanation: string;
};

type ServiceTariffInput = {
  numero_orden: string;
  descripcion_especifica?: string | null;
  valor_cobrado: number;
  tipo_servicio_nombre?: string | null;
  valor_estandar?: number | null;
  tipo_servicio_activo?: boolean | null;
  requiere_valor_admin?: boolean | null;
};

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function needsManualReview(charged: number, explanation: string): TariffAuditResult {
  return {
    status: 'manual_review',
    charged,
    expected: null,
    difference: null,
    explanation,
  };
}

export function auditServiceTariff(service: ServiceTariffInput): TariffAuditResult {
  const charged = Number(service.valor_cobrado);
  const description = normalize(service.descripcion_especifica ?? '');
  const serviceName = normalize(service.tipo_servicio_nombre ?? '');

  if (service.numero_orden.startsWith('T-') || serviceName.includes('traslado')) {
    return needsManualReview(
      charged,
      'El cobro de traslado depende de la ruta y de los servicios incluidos en el viaje.',
    );
  }

  if (service.requiere_valor_admin) {
    return needsManualReview(
      charged,
      charged > 0
        ? 'El valor de este servicio lo asigna el administrador; no tiene tarifa fija.'
        : 'Falta que el administrador asigne el valor de este servicio.',
    );
  }

  const standard = Number(service.valor_estandar);
  if (!Number.isFinite(charged) || !Number.isFinite(standard)) {
    return needsManualReview(charged, 'No hay una tarifa estándar disponible para comparar este servicio.');
  }
  if (!serviceName || service.tipo_servicio_activo === false) {
    return needsManualReview(
      charged,
      'El tipo de servicio no tiene una tarifa vigente verificable.',
    );
  }

  const splitDoors = description.match(/puertas desmontadas:\s*nevecon antiguo (\d+), nevecon nuevo (\d+)/);
  // Las órdenes guardadas antes del desglose por equipo traen un único total.
  const legacyDoors = splitDoors ? null : description.match(/puertas desmontadas:\s*(\d+)/);
  const doorsOld = Number(splitDoors?.[1] ?? legacyDoors?.[1] ?? 0);
  const doorsNew = Number(splitDoors?.[2] ?? 0);
  const doors = doorsOld + doorsNew;
  const hasHelper = /ayudante:\s*si\b/.test(description);
  const isCollection = /recoleccion|recogida/.test(serviceName);
  const isNeveconManoAMano = isCollection && serviceName.includes('nevecon') &&
    serviceName.includes('mano a mano');
  if (doors > 0 && (!isNeveconManoAMano || doorsOld > 4 || doorsNew > 4)) {
    return needsManualReview(
      charged,
      'El adicional de puertas no coincide con las reglas permitidas para este tipo de servicio.',
    );
  }
  if (hasHelper && !isCollection) {
    return needsManualReview(
      charged,
      'El adicional de ayudante solo se puede comparar en servicios de recolección.',
    );
  }

  const includesHelper = serviceName.includes('incluye ayudante');
  const helperCharge = !includesHelper && hasHelper ? 10_000 : 0;
  const expected = standard + doors * 10_000 + helperCharge;
  const difference = charged - expected;
  const explanation = [
    `Tarifa estándar vigente: ${standard}.`,
    doors > 0
      ? splitDoors
        ? `Puertas: ${doorsOld} del nevecon antiguo y ${doorsNew} del nuevo: ${doors * 10_000}.`
        : `${doors} puerta(s): ${doors * 10_000}.`
      : null,
    helperCharge > 0 ? 'Adicional de ayudante: 10000.' : null,
  ].filter(Boolean).join(' ');

  return {
    status: Math.abs(difference) <= 1 ? 'match' : 'mismatch',
    charged,
    expected,
    difference,
    explanation,
  };
}

export function summarizeTariffAudits(results: TariffAuditResult[]) {
  return {
    coincidencias: results.filter((result) => result.status === 'match').length,
    diferencias: results.filter((result) => result.status === 'mismatch').length,
    revision_manual: results.filter((result) => result.status === 'manual_review').length,
  };
}
