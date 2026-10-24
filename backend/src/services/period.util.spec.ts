import { describe, it, expect } from 'vitest';
import {
  isVentanaAbierta,
  getPeriodoAnterior,
  getPeriodoARadicar,
  getColombiaToday,
} from './period.util.js';

describe('period.util', () => {
  describe('isVentanaAbierta (regla días 1-5)', () => {
    it('abre del día 1 al 5 inclusive', () => {
      expect(isVentanaAbierta(1)).toBe(true);
      expect(isVentanaAbierta(3)).toBe(true);
      expect(isVentanaAbierta(5)).toBe(true);
    });

    it('cierra del día 6 en adelante y en el día 0', () => {
      expect(isVentanaAbierta(6)).toBe(false);
      expect(isVentanaAbierta(15)).toBe(false);
      expect(isVentanaAbierta(31)).toBe(false);
      expect(isVentanaAbierta(0)).toBe(false);
    });
  });

  describe('getPeriodoAnterior (se radica el mes que cerró)', () => {
    it('octubre -> septiembre del mismo año', () => {
      expect(getPeriodoAnterior({ anio: 2026, mes: 10 })).toEqual({
        mes: 9,
        anio: 2026,
      });
    });

    it('enero -> diciembre del año anterior', () => {
      expect(getPeriodoAnterior({ anio: 2026, mes: 1 })).toEqual({
        mes: 12,
        anio: 2025,
      });
    });
  });

  describe('getPeriodoARadicar (ventana 1-5 vs. resto del mes)', () => {
    it('días 1-5 => mes anterior', () => {
      expect(getPeriodoARadicar({ anio: 2026, mes: 10, dia: 1 })).toEqual({
        mes: 9,
        anio: 2026,
      });
      expect(getPeriodoARadicar({ anio: 2026, mes: 10, dia: 5 })).toEqual({
        mes: 9,
        anio: 2026,
      });
    });

    it('día 6 en adelante => mes en curso', () => {
      expect(getPeriodoARadicar({ anio: 2026, mes: 10, dia: 6 })).toEqual({
        mes: 10,
        anio: 2026,
      });
      expect(getPeriodoARadicar({ anio: 2026, mes: 10, dia: 16 })).toEqual({
        mes: 10,
        anio: 2026,
      });
    });

    it('enero días 1-5 => diciembre del año anterior', () => {
      expect(getPeriodoARadicar({ anio: 2026, mes: 1, dia: 3 })).toEqual({
        mes: 12,
        anio: 2025,
      });
    });
  });

  describe('getColombiaToday (UTC-5)', () => {
    it('respeta el corte de día a medianoche de Colombia', () => {
      // 04:59:59Z => 23:59:59 del día anterior en Colombia
      expect(getColombiaToday(new Date('2026-10-06T04:59:59Z'))).toEqual({
        anio: 2026,
        mes: 10,
        dia: 5,
      });
      // 05:00:00Z => 00:00:00 del 6 en Colombia
      expect(getColombiaToday(new Date('2026-10-06T05:00:00Z'))).toEqual({
        anio: 2026,
        mes: 10,
        dia: 6,
      });
    });

    it('cruza el cambio de mes en Colombia', () => {
      // 2026-11-01T03:00:00Z => 2026-10-31T22:00 en Colombia
      expect(getColombiaToday(new Date('2026-11-01T03:00:00Z'))).toEqual({
        anio: 2026,
        mes: 10,
        dia: 31,
      });
    });
  });
});
