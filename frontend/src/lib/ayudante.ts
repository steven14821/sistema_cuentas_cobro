export function normalizarNombreTipo(nombre: string): string {
  return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function esRecoleccionTipo(nombre: string): boolean {
  return /recoleccion|recogida/.test(normalizarNombreTipo(nombre));
}

export function esNeveconManoAManoTipo(nombre: string): boolean {
  const normalizado = normalizarNombreTipo(nombre);
  return esRecoleccionTipo(nombre) && normalizado.includes('nevecon') && normalizado.includes('mano a mano');
}

export function incluyeAyudanteEnElNombre(nombre: string): boolean {
  return /\([^)]*ayudante[^)]*\)/.test(normalizarNombreTipo(nombre));
}

export function preguntaPorAyudante(nombre?: string | null): boolean {
  if (!nombre) return false;
  return esRecoleccionTipo(nombre) && !incluyeAyudanteEnElNombre(nombre) && !esNeveconManoAManoTipo(nombre);
}
