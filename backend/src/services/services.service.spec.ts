import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ServicesService } from './services.service.js';

function makePrisma() {
  return {
    excepciones_carga: { findFirst: vi.fn() },
    tipos_servicio: { findUnique: vi.fn() },
    cuentas_cobro: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    servicios: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    usuarios: { findUnique: vi.fn() },
  } as any;
}

const TIPO = {
  id: 'tipo-1',
  nombre: 'Mantenimiento Preventivo',
  valor_estandar: '50000',
  activo: true,
};

describe('ServicesService', () => {
  let prisma: any;
  let transportCalculator: any;
  let service: ServicesService;

  beforeEach(() => {
    prisma = makePrisma();
    transportCalculator = {
      calculateTransferValue: vi.fn(() => 10000),
      getMotoTariff: vi.fn(() => undefined),
    };
    service = new ServicesService(prisma, transportCalculator);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createService — ventana de carga (días 1-5, UTC-5)', () => {
    it('el día 5 permite registrar y guarda el MES ANTERIOR con el valor del tipo', async () => {
      // 2026-10-05T15:00:00Z => 10:00 en Colombia (día 5, ventana abierta)
      vi.setSystemTime(new Date('2026-10-05T15:00:00Z'));

      prisma.tipos_servicio.findUnique.mockResolvedValue(TIPO);
      prisma.cuentas_cobro.findUnique.mockResolvedValue(null);
      prisma.cuentas_cobro.create.mockResolvedValue({
        id: 'cuenta-1',
        usuario_id: 'u1',
        mes: 9,
        anio: 2026,
        estado: 'Pendiente',
        radicada: false,
      });
      prisma.servicios.findFirst.mockResolvedValue(null);
      prisma.servicios.create.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        tipo_servicio_id: 'tipo-1',
        numero_orden: 'BUC-12345',
        descripcion_especifica: 'x',
        valor_cobrado: '50000',
        estado: 'Pendiente',
        created_at: new Date(),
        updated_at: new Date(),
        tipos_servicio: TIPO,
      });
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Bucaramanga' });

      const res = await service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: 'buc-12345',
        descripcion_especifica: 'x',
      });

      // La cuenta nace en el MES ANTERIOR (septiembre), no en octubre.
      expect(prisma.cuentas_cobro.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mes: 9, anio: 2026, radicada: false }),
        }),
      );
      // El valor y el número de orden los fija el backend.
      expect(prisma.servicios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            valor_cobrado: '50000',
            numero_orden: 'BUC-12345',
          }),
        }),
      );
      expect(res.valor_cobrado).toBe(50000);
      expect(res.numero_orden).toBe('BUC-12345');
    });

    it('el día 6 sin excepción queda bloqueado', async () => {
      // 2026-10-06T15:00:00Z => 10:00 en Colombia (día 6)
      vi.setSystemTime(new Date('2026-10-06T15:00:00Z'));
      prisma.excepciones_carga.findFirst.mockResolvedValue(null);
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Bucaramanga' });

      await expect(
        service.createService('u1', {
          tipo_servicio_id: 'tipo-1',
          numero_orden: 'BUC-12345',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // No debe crear cuenta ni servicio.
      expect(prisma.cuentas_cobro.create).not.toHaveBeenCalled();
      expect(prisma.servicios.create).not.toHaveBeenCalled();
    });

    it('fuera de ventana pero con excepción vigente permite registrar', async () => {
      vi.setSystemTime(new Date('2026-10-20T15:00:00Z'));
      prisma.excepciones_carga.findFirst.mockResolvedValue({ id: 'exc-1' });
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Bucaramanga' });
      prisma.tipos_servicio.findUnique.mockResolvedValue(TIPO);
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        estado: 'Pendiente',
        radicada: false,
      });
      prisma.servicios.findFirst.mockResolvedValue(null);
      prisma.servicios.create.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        numero_orden: 'CUC-1',
        valor_cobrado: '50000',
        estado: 'Pendiente',
        tipos_servicio: TIPO,
        created_at: new Date(),
      });

      await expect(
        service.createService('u1', {
          tipo_servicio_id: 'tipo-1',
          numero_orden: 'CUC-1',
        }),
      ).resolves.toBeDefined();
    });

    it('rechaza orden duplicada en la misma cuenta', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue(TIPO);
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        estado: 'Pendiente',
        radicada: false,
      });
      prisma.servicios.findFirst.mockResolvedValue({ id: 'existente' });

      await expect(
        service.createService('u1', {
          tipo_servicio_id: 'tipo-1',
          numero_orden: 'BUC-99999',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza agregar a una cuenta ya radicada', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue(TIPO);
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        estado: 'Pendiente',
        radicada: true,
      });

      await expect(
        service.createService('u1', {
          tipo_servicio_id: 'tipo-1',
          numero_orden: 'BUC-12345',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('radicarAccount', () => {
    it('falla si no existe la cuenta del período', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.cuentas_cobro.findUnique.mockResolvedValue(null);

      await expect(service.radicarAccount('u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('falla si la cuenta no tiene servicios', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        radicada: false,
        servicios: [],
      });

      await expect(service.radicarAccount('u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('marca la cuenta como radicada', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        mes: 9,
        anio: 2026,
        estado: 'Pendiente',
        radicada: false,
        servicios: [{ id: 's1' }],
      });
      prisma.cuentas_cobro.update.mockResolvedValue({
        id: 'cuenta-1',
        mes: 9,
        anio: 2026,
        estado: 'Pendiente',
        radicada: true,
      });

      const res = await service.radicarAccount('u1');

      expect(prisma.cuentas_cobro.update).toHaveBeenCalledWith({
        where: { id: 'cuenta-1' },
        data: { radicada: true },
      });
      expect(res.radicada).toBe(true);
    });
  });

  describe('deleteService', () => {
    it('no permite borrar un servicio de otra cuenta', async () => {
      prisma.servicios.findUnique.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        cuentas_cobro: { usuario_id: 'otro', radicada: false },
      });

      await expect(service.deleteService('u1', 's1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('elimina la cuenta si queda sin servicios', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.servicios.findUnique.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        cuentas_cobro: { usuario_id: 'u1', radicada: false },
      });
      prisma.servicios.delete.mockResolvedValue({});
      prisma.servicios.count.mockResolvedValue(0);
      prisma.cuentas_cobro.delete.mockResolvedValue({});

      const res = await service.deleteService('u1', 's1');

      expect(prisma.cuentas_cobro.delete).toHaveBeenCalledWith({
        where: { id: 'cuenta-1' },
      });
      expect(res.cuentaEliminada).toBe(true);
    });
  });
});
