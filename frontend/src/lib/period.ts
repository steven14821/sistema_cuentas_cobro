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

export function getColombiaTodayString(): string {
  const hoy = getColombiaToday();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${hoy.anio}-${pad(hoy.mes)}-${pad(hoy.dia)}`;
}

// Formatea una fecha dada respetando la fecha calendario en Colombia (DD/MM/YYYY)
export function formatFechaColombia(raw: string | Date | null | undefined): string {
  if (!raw) return '—';
  const str = typeof raw === 'string' ? raw : raw.toISOString();
  const datePart = str.split('T')[0];
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

// Determina si una excepción sigue vigente hasta las 23:59:59.999 hora Colombia de la fecha dada
export function isExcepcionVigente(rawDate: string | Date | null | undefined): boolean {
  if (!rawDate) return false;
  const str = typeof rawDate === 'string' ? rawDate : rawDate.toISOString();
  const datePart = str.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return false;
  // Fin de ese día en Colombia: 23:59:59.999 Colombia = 04:59:59.999 UTC del día siguiente
  const endOfDayUtc = Date.UTC(y, m - 1, d, 23, 59, 59, 999) + COLOMBIA_OFFSET_MS;
  return Date.now() <= endOfDayUtc;
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
