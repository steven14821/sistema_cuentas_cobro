function Unidades(num: number): string {
  switch (num) {
    case 1: return 'UN';
    case 2: return 'DOS';
    case 3: return 'TRES';
    case 4: return 'CUATRO';
    case 5: return 'CINCO';
    case 6: return 'SEIS';
    case 7: return 'SIETE';
    case 8: return 'OCHO';
    case 9: return 'NUEVE';
    default: return '';
  }
}

function DecenasY(strSin: string, numUnidades: number): string {
  if (numUnidades > 0) return `${strSin} Y ${Unidades(numUnidades)}`;
  return strSin;
}

function Decenas(num: number): string {
  const decena = Math.floor(num / 10);
  const unidad = num - decena * 10;
  switch (decena) {
    case 1:
      switch (unidad) {
        case 0: return 'DIEZ';
        case 1: return 'ONCE';
        case 2: return 'DOCE';
        case 3: return 'TRECE';
        case 4: return 'CATORCE';
        case 5: return 'QUINCE';
        default: return `DIECI${Unidades(unidad)}`;
      }
    case 2:
      switch (unidad) {
        case 0: return 'VEINTE';
        default: return `VEINTI${Unidades(unidad)}`;
      }
    case 3: return DecenasY('TREINTA', unidad);
    case 4: return DecenasY('CUARENTA', unidad);
    case 5: return DecenasY('CINCUENTA', unidad);
    case 6: return DecenasY('SESENTA', unidad);
    case 7: return DecenasY('SETENTA', unidad);
    case 8: return DecenasY('OCHENTA', unidad);
    case 9: return DecenasY('NOVENTA', unidad);
    case 0: return Unidades(unidad);
    default: return '';
  }
}

function Centenas(num: number): string {
  const centenas = Math.floor(num / 100);
  const decenas = num - centenas * 100;
  switch (centenas) {
    case 1:
      if (decenas > 0) return `CIENTO ${Decenas(decenas)}`;
      return 'CIEN';
    case 2: return `DOSCIENTOS ${Decenas(decenas)}`;
    case 3: return `TRESCIENTOS ${Decenas(decenas)}`;
    case 4: return `CUATROCIENTOS ${Decenas(decenas)}`;
    case 5: return `QUINIENTOS ${Decenas(decenas)}`;
    case 6: return `SEISCIENTOS ${Decenas(decenas)}`;
    case 7: return `SETECIENTOS ${Decenas(decenas)}`;
    case 8: return `OCHOCIENTOS ${Decenas(decenas)}`;
    case 9: return `NOVECIENTOS ${Decenas(decenas)}`;
    default: return Decenas(decenas);
  }
}

export function numeroALetras(num: number): string {
  const entero = Math.floor(Math.abs(num));
  if (entero === 0) return 'Cero pesos';

  let n = entero;
  let resultado = '';

  // Millones
  if (n >= 1000000) {
    const millones = Math.floor(n / 1000000);
    n = n % 1000000;
    if (millones === 1) resultado += 'UN MILLON ';
    else resultado += `${Centenas(millones)} MILLONES `;
  }

  // Miles
  if (n >= 1000) {
    const miles = Math.floor(n / 1000);
    n = n % 1000;
    if (miles === 1) resultado += 'MIL ';
    else resultado += `${Centenas(miles)} MIL `;
  }

  // Cientos / decenas / unidades
  if (n > 0) {
    resultado += `${Centenas(n)} `;
  }

  resultado = resultado.trim().toLowerCase();
  // Capitalizar la primera letra y agregar 'pesos'
  return `${resultado.charAt(0).toUpperCase()}${resultado.slice(1)} pesos`;
}
