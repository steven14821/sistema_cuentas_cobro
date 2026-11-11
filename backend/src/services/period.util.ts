// Reglas de período/ventana de carga para cuentas de cobro.
// Zona horaria de Colombia (UTC-5, sin horario de verano).

export const COLOMBIA_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface Periodo {
  mes: number; // 1-12
  anio: number;
}

export interface FechaColombia {
  anio: number;
  mes: number; // 1-12
  dia: number; // 1-31
}

// Devuelve un Date cuyo componente UTC representa la hora local de Colombia.
export function getColombiaNow(base: Date = new Date()): Date {
  return new Date(base.getTime() - COLOMBIA_OFFSET_MS);
}

// Parte de fecha (año/mes/día) en hora Colombia.
export function getColombiaToday(base: Date = new Date()): FechaColombia {
  const now = getColombiaNow(base);
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

// Durante los días 1-5 se radica el mes que acaba de cerrar (mes anterior).
export function getPeriodoAnterior(fecha: Pick<FechaColombia, 'anio' | 'mes'>): Periodo {
  let mes = fecha.mes - 1;
  let anio = fecha.anio;
  if (mes === 0) {
    mes = 12;
    anio = fecha.anio - 1;
  }
  return { mes, anio };
}

// Período de carga vigente: días 1-5 => mes anterior (el que cerró);
// resto del mes => mes en curso (se acumula hasta la próxima ventana).
export function getPeriodoARadicar(fecha: FechaColombia): Periodo {
  if (isVentanaAbierta(fecha.dia)) return getPeriodoAnterior(fecha);
  return { mes: fecha.mes, anio: fecha.anio };
}

// Una excepción vigente después del día 5 mantiene abierta la cuenta del mes anterior.
export function getPeriodoConExcepcion(
  fecha: FechaColombia,
  tieneExcepcion: boolean,
): Periodo {
  if (tieneExcepcion) return getPeriodoAnterior(fecha);
  return getPeriodoARadicar(fecha);
}

// Date a medianoche UTC, compatible con columnas @db.Date.
export function toUtcDate({ anio, mes, dia }: FechaColombia): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0));
}

// Convierte una fecha YYYY-MM-DD ingresada por el admin a una fecha de vencimiento a las 23:59:59.999 hora Colombia.
export function parseColombiaEndOfDay(fechaStr: string | Date): Date {
  if (fechaStr instanceof Date) {
    fechaStr = fechaStr.toISOString().split('T')[0];
  }
  const parts = String(fechaStr).split('T')[0].split('-').map(Number);
  const anio = parts[0];
  const mes = parts[1];
  const dia = parts[2];
  // 23:59:59.999 hora Colombia (UTC-5) equivale a las 04:59:59.999 UTC del día siguiente
  return new Date(Date.UTC(anio, mes - 1, dia, 23, 59, 59, 999) + COLOMBIA_OFFSET_MS);
}
