// Reglas de período/ventana en hora Colombia (UTC-5), espejo del backend.

export const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export interface FechaColombia {
  anio: number;
  mes: number; // 1-12
  dia: number; // 1-31
}

export interface Periodo {
  mes: number;
  anio: number;
}

export function getColombiaToday(base: Date = new Date()): FechaColombia {
  const now = new Date(base.getTime() - COLOMBIA_OFFSET_MS);
  return {
    anio: now.getUTCFullYear(),
    mes: now.getUTCMonth() + 1,
    dia: now.getUTCDate(),
  };
}

// La ventana de carga está abierta del día 1 al 5 (incluidos).
export function isVentanaAbierta(dia: number): boolean {
  return dia >= 1 && dia <= 5;
}

// Durante los días 1-5 se radica el mes que acaba de cerrar.
export function getPeriodoAnterior(fecha: Pick<FechaColombia, 'anio' | 'mes'>): Periodo {
  let mes = fecha.mes - 1;
  let anio = fecha.anio;
  if (mes === 0) {
    mes = 12;
    anio = fecha.anio - 1;
  }
  return { mes, anio };
}

// Período de carga vigente: días 1-5 => mes anterior; resto => mes en curso.
export function getPeriodoARadicar(fecha: FechaColombia): Periodo {
  if (isVentanaAbierta(fecha.dia)) return getPeriodoAnterior(fecha);
  return { mes: fecha.mes, anio: fecha.anio };
}

export function nombreMes(mes: number): string {
  return MESES[mes - 1] ?? String(mes);
}

// Formato COP sin decimales: 50000 -> "$ 50.000"
export function formatCOP(v: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}
