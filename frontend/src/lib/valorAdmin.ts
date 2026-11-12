import { formatCOP } from './period';

export const POR_DEFINIR = 'Por definir';

export interface ServicioConValorAdmin {
  requiere_valor_admin?: boolean | null;
  valor_cobrado?: number | string | null;
}

export function servicioSinValorAdmin(servicio?: ServicioConValorAdmin | null): boolean {
  return !!servicio?.requiere_valor_admin && Number(servicio?.valor_cobrado ?? 0) <= 0;
}

export function totalOPorDefinir(total: number, sinValor: boolean): string {
  return sinValor ? POR_DEFINIR : formatCOP(total);
}
