import { Injectable } from '@nestjs/common';

// Catálogo de tarifas fijas por lugar para traslados en moto propia (Cúcuta).
// Estos valores pueden venir de otro lado (DB/config) en un futuro; por ahora son la fuente de verdad
// para el cálculo del traslado del técnico que usa su moto propia en Cúcuta.
export const CUCUTA_MOTO_TARIFF: Record<string, number> = {
  PATIOS: 4000,
  VILLA_DEL_ROSARIO: 4000,
  ZULIA: 8000,
  TOLEDO: 140000,
  PAMPLONA: 55000,
  MUTISCA: 65000,
  CHINACOTA: 30000,
  DURANIA: 35000,
  BOCHALEMA: 35000,
};

// Tarifas fijas por lugar para traslados en moto propia (Bucaramanga).
export const BUCARAMANGA_MOTO_TARIFF: Record<string, number> = {
  PIEDECUESA: 8000,
  GIRON: 5000,
  LEBRIJA: 10000,
  FLORIDA: 3000,
  LOS_SANTOS: 25000,
  RIONEGRO_PLAYON: 30000,
  PESCADERO: 25000,
  ZAPATOCA: 60000,
  CUARESMA: 12000,
  SOGAMOSO: 35000,
  MATANZA: 25000,
  ACAPULCO: 9000,
  SAN_VICENTE: 75000,
  BARRANCABERMEJA: 85000,
  SAN_GIL: 95000,
};

export enum TransportType {
  MOTO = 'MOTO_PROPIA',
  VEHICLE = 'VEHICULO_EMPRESA',
}

/**
 * Calcula el valor de un traslado para un técnico de Cúcuta o Bucaramanga.
 *
 * Reglas recibidas:
 * - Moto propia: tarifa fija por zona (catálogo por lugar).
 *   - En Cúcuta, la tarifa de moto propia se suma al valor del servicio que se presta.
 *   - En Bucaramanga, la tarifa de moto propia es directa (valor fijo por lugar).
 * - Vehículo empresa, ruta Pamplona (o ruta mixta que incluya Pamplona/Pamplonita):
 *     base 100.000 por 1 o 2 servicios (garantías o facturados);
 *     siempre los 2 servicios que se incluyen en la base son los más baratos, con tope de 25.000
 *     por servicio. Si los 2 servicios superan ese tope, la diferencia se suma al precio base.
 *     Servicios adicionales y ayudantes se suman al precio base según corresponda.
 * - Vehículo empresa, ruta solo en carro hasta Chinácota / Durania / Bochalema:
 *     50.000 de base + 20.000 por cada servicio (cualquiera que sea).
 *
 * Este método calcula el valor total del traslado que debe registrarse como servicio.
 * Para vehículo empresa, el valor puede depender de los servicios previos de la cuenta
 * (porque la base es por viaje/ruta). Por eso recibe `currentServices`.
 */
@Injectable()
export class TransportCalculatorService {
  private readonly MAX_BASE_PER_SERVICE = 25000;

  calculateTransferValue(
    transportType: TransportType,
    destination: string,
    currentServices: { valor_cobrado: number }[],
    newServiceValue: number,
  ): number {
    if (transportType === TransportType.MOTO) {
      const destUpper = destination.toUpperCase();

      const fixedTariff =
        CUCUTA_MOTO_TARIFF[destUpper] ?? BUCARAMANGA_MOTO_TARIFF[destUpper];

      if (fixedTariff !== undefined) {
        const isCucuta = destUpper in CUCUTA_MOTO_TARIFF;

        if (isCucuta) {
          return fixedTariff + newServiceValue;
        }

        return fixedTariff;
      }

      return 0;
    }

    const destLower = destination.toLowerCase();

    if (this.includesPamplona(destLower)) {
      return this.calculatePamplonaBase(currentServices, newServiceValue);
    }

    if (this.isCarRouteTo(destLower, ['chinácota', 'durania', 'bochalema'])) {
      return this.calculateCarBase(currentServices, newServiceValue, 50000, 20000);
    }

    return 0;
  }

  getMotoTariff(location: string): number | undefined {
    const upper = location.toUpperCase();
    return CUCUTA_MOTO_TARIFF[upper] ?? BUCARAMANGA_MOTO_TARIFF[upper];
  }

  private includesPamplona(destLower: string): boolean {
    return destLower.includes('pamplona') || destLower.includes('pamplonita');
  }

  private isCarRouteTo(destLower: string, locations: string[]): boolean {
    return locations.some((l) => destLower.includes(l));
  }

  private calculatePamplonaBase(
    currentServices: { valor_cobrado: number }[],
    newServiceValue: number,
  ): number {
    const base = 100000;

    const allValues = [
      ...currentServices.map((s) => s.valor_cobrado),
      newServiceValue,
    ]
      .filter((v) => typeof v === 'number' && isFinite(v))
      .sort((a, b) => a - b);

    const cheapestTwo = allValues.slice(0, 2);

    let totalBase = base;

    for (const val of cheapestTwo) {
      if (val > this.MAX_BASE_PER_SERVICE) {
        totalBase += val - this.MAX_BASE_PER_SERVICE;
      }
    }

    return totalBase;
  }

  private calculateCarBase(
    currentServices: { valor_cobrado: number }[],
    newServiceValue: number,
    base: number,
    perService: number,
  ): number {
    const totalServices = currentServices.length + 1;
    return base + perService * totalServices;
  }
}
