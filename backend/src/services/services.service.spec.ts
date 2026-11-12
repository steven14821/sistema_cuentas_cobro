import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ServicesService } from './services.service.js';

function makePrisma() {
  const prisma: any = {
    excepciones_carga: { findFirst: vi.fn() },
    tipos_servicio: { findUnique: vi.fn() },
    cuentas_cobro: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    servicios: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    usuarios: { findUnique: vi.fn() },
  };
  prisma.$transaction = vi.fn(async (callback: (tx: any) => unknown) => callback(prisma));
  return prisma;
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

  it('uses the previous month for an active exception after the regular window', async () => {
    vi.setSystemTime(new Date('2026-11-09T15:00:00Z'));
    prisma.excepciones_carga.findFirst.mockResolvedValue({
      id: 'exception-1',
      fecha_vencimiento: new Date('2026-11-11T00:00:00Z'),
    });
    prisma.cuentas_cobro.findUnique.mockResolvedValue(null);

    const result = await service.getMyAccount('u1');

    expect(result.periodo).toEqual({ mes: 10, anio: 2026 });
    expect(prisma.cuentas_cobro.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          usuario_id_mes_anio: {
            usuario_id: 'u1',
            mes: 10,
            anio: 2026,
          },
        },
      }),
    );
  });

  describe('createService — ventana de carga (días 1-5, UTC-5)', () => {
    it('permite agregar servicios a una cuenta devuelta aunque la ventana esté cerrada', async () => {
      vi.setSystemTime(new Date('2026-10-10T15:00:00Z'));
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        usuario_id: 'u1',
        estado: 'Observado',
        radicada: true,
      });
      prisma.tipos_servicio.findUnique.mockResolvedValue(TIPO);
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Bucaramanga' });
      prisma.servicios.findFirst.mockResolvedValue(null);
      prisma.servicios.create.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        tipo_servicio_id: 'tipo-1',
        numero_orden: 'BUC-12345',
        descripcion_especifica: 'Servicio',
        valor_cobrado: 50_000,
        estado: 'Observado',
        fotos: [],
        tipos_servicio: TIPO,
      });

      await service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        descripcion_especifica: 'Servicio',
      });

      expect(prisma.excepciones_carga.findFirst).toHaveBeenCalled();
      expect(prisma.servicios.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ estado: 'Observado' }),
      }));
    });

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
        valor_cobrado: 50_000,
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
        fotos: ['data:image/png;base64,abc='],
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
            valor_cobrado: 50_000,
            numero_orden: 'BUC-12345',
            fotos: ['data:image/png;base64,abc='],
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

    it('permite reutilizar un número de orden de otra cuenta o período', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue(TIPO);
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-actual',
        estado: 'Pendiente',
        radicada: false,
      });
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Bucaramanga' });
      prisma.servicios.findFirst.mockResolvedValue(null);
      prisma.servicios.create.mockResolvedValue({
        id: 's-reutilizada',
        cuenta_cobro_id: 'cuenta-actual',
        numero_orden: 'BUC-12345',
        valor_cobrado: '50000',
        estado: 'Pendiente',
        tipos_servicio: TIPO,
        created_at: new Date(),
      });

      await expect(service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
      })).resolves.toBeDefined();
    });

    it('rechaza fotos que no sean imágenes admitidas', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue(TIPO);

      await expect(service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        fotos: ['data:text/html;base64,PHNjcmlwdD4='],
      })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.cuentas_cobro.create).not.toHaveBeenCalled();
    });

    it('exige una foto de puertas al registrar el desmonte en nevecon mano a mano', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        ...TIPO,
        nombre: 'SAMSUNG: Recolección Nevecon mano a mano',
      });

      await expect(service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        puertas_nevecon_antiguo: 2,
      })).rejects.toThrow('Agrega al menos una foto');
      expect(prisma.cuentas_cobro.create).not.toHaveBeenCalled();
    });

    it('rechaza el desmonte de puertas en un cambio de nevecon', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        ...TIPO,
        nombre: 'SAMSUNG: Recolección Nevecon cambio (incluye ayudante)',
      });

      await expect(service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        puertas_nevecon_antiguo: 1,
        fotos_puertas: ['data:image/png;base64,door='],
      })).rejects.toThrow('solo aplica a la recolección de nevecon mano a mano');
      expect(prisma.cuentas_cobro.create).not.toHaveBeenCalled();
    });

    it('exige una foto del motivo cuando se registra un ayudante', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        ...TIPO,
        nombre: 'SAMSUNG: Recolección aire acondicionado',
      });

      await expect(service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        requiere_ayudante: true,
      })).rejects.toThrow('Agrega al menos una foto del motivo');
      expect(prisma.cuentas_cobro.create).not.toHaveBeenCalled();
    });

    it('exige el motivo escrito cuando se registra un ayudante', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        ...TIPO,
        nombre: 'SAMSUNG: Recolección aire acondicionado',
      });

      await expect(service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        requiere_ayudante: true,
        fotos_ayudante: ['data:image/png;base64,helper='],
      })).rejects.toThrow('Describe por qué necesitaste ayudante');
      expect(prisma.cuentas_cobro.create).not.toHaveBeenCalled();
    });

    it('no pregunta, exige foto ni cobra adicional si el servicio ya incluye ayudante', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      const tipoConAyudante = {
        ...TIPO,
        nombre: 'SAMSUNG: Recolección (incluye ayudante)',
      };
      prisma.tipos_servicio.findUnique.mockResolvedValue(tipoConAyudante);
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        estado: 'Pendiente',
        radicada: false,
      });
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Bucaramanga' });
      prisma.servicios.findFirst.mockResolvedValue(null);
      prisma.servicios.create.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        tipo_servicio_id: 'tipo-1',
        numero_orden: 'BUC-12345',
        descripcion_especifica: 'Recolección estándar',
        valor_cobrado: '50000',
        estado: 'Pendiente',
        created_at: new Date(),
        tipos_servicio: tipoConAyudante,
      });

      await service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        descripcion_especifica: 'Recolección estándar',
        requiere_ayudante: true,
      });

      expect(prisma.servicios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            descripcion_especifica: 'Recolección estándar',
            valor_cobrado: 50_000,
            fotos: [],
          }),
        }),
      );
    });

    it('aplica $10.000 por puerta de cada nevecon (máximo cuatro por equipo) y $10.000 por ayudante', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        ...TIPO,
        nombre: 'SAMSUNG: Recolección Nevecon mano a mano',
      });
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        estado: 'Pendiente',
        radicada: false,
      });
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Bucaramanga' });
      prisma.servicios.findFirst.mockResolvedValue(null);
      prisma.servicios.create.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        tipo_servicio_id: 'tipo-1',
        numero_orden: 'BUC-12345',
        descripcion_especifica: 'Recolección: Puertas desmontadas: nevecon antiguo 2, nevecon nuevo 1 (fotos: 1), Ayudante: sí (fotos del motivo: 1)',
        valor_cobrado: '90000',
        estado: 'Pendiente',
        created_at: new Date(),
        tipos_servicio: TIPO,
      });

      await service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        descripcion_especifica: '',
        puertas_nevecon_antiguo: 2,
        puertas_nevecon_nuevo: 1,
        requiere_ayudante: true,
        motivo_ayudante: 'El equipo era muy pesado para moverlo solo.',
        fotos_puertas: ['data:image/png;base64,door='],
        fotos_ayudante: ['data:image/png;base64,helper='],
      });

      expect(prisma.servicios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            descripcion_especifica: 'Recolección: Puertas desmontadas: nevecon antiguo 2, nevecon nuevo 1 (fotos: 1), Ayudante: sí (motivo: El equipo era muy pesado para moverlo solo., fotos del motivo: 1)',
            valor_cobrado: 90_000,
            fotos: ['data:image/png;base64,door=', 'data:image/png;base64,helper='],
          }),
        }),
      );
    });

    it('acepta cuatro puertas en cada nevecon', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        ...TIPO,
        nombre: 'SAMSUNG: Recolección Nevecon mano a mano',
      });
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'cuenta-1',
        estado: 'Pendiente',
        radicada: false,
      });
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Bucaramanga' });
      prisma.servicios.findFirst.mockResolvedValue(null);
      prisma.servicios.create.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        tipo_servicio_id: 'tipo-1',
        numero_orden: 'BUC-12345',
        valor_cobrado: '130000',
        estado: 'Pendiente',
        created_at: new Date(),
        tipos_servicio: TIPO,
      });

      await service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        puertas_nevecon_antiguo: 4,
        puertas_nevecon_nuevo: 4,
        fotos_puertas: ['data:image/png;base64,door='],
      });

      expect(prisma.servicios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ valor_cobrado: 130_000 }),
        }),
      );
    });

    it('rechaza más de cuatro puertas en un mismo nevecon', async () => {
      vi.setSystemTime(new Date('2026-10-03T15:00:00Z'));
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        ...TIPO,
        nombre: 'SAMSUNG: Recolección Nevecon mano a mano',
      });

      await expect(service.createService('u1', {
        tipo_servicio_id: 'tipo-1',
        numero_orden: '12345',
        puertas_nevecon_nuevo: 5,
      })).rejects.toThrow('entre 0 y 4');
      expect(prisma.cuentas_cobro.create).not.toHaveBeenCalled();
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

    describe('updateService — corrección de órdenes', () => {
      it('permite editar cualquier servicio mientras toda la cuenta está en corrección', async () => {
        prisma.servicios.findUnique.mockResolvedValue({
          id: 's1',
          cuenta_cobro_id: 'cuenta-1',
          tipo_servicio_id: 'tipo-1',
          numero_orden: 'BUC-12345',
          descripcion_especifica: 'Servicio observado',
          valor_cobrado: 50_000,
          estado: 'Aprobado',
          cuentas_cobro: { usuario_id: 'u1', radicada: true, estado: 'Observado' },
        });
        prisma.servicios.findFirst.mockResolvedValue(null);
        prisma.servicios.update.mockResolvedValue({
          id: 's1',
          cuenta_cobro_id: 'cuenta-1',
          tipo_servicio_id: 'tipo-1',
          numero_orden: 'BUC-54321',
          descripcion_especifica: 'Servicio corregido',
          valor_cobrado: 50_000,
          estado: 'Observado',
          tipos_servicio: TIPO,
        });

        await service.updateService('u1', 's1', {
          numero_orden: '54321',
          descripcion_especifica: 'Servicio corregido',
        });

        expect(prisma.servicios.update).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ estado: 'Aprobado', numero_orden: 'BUC-54321' }),
        }));
        expect(prisma.servicios.findMany).not.toHaveBeenCalled();
      });

      it('conserva el prefijo del servicio y devuelve la cuenta a pendiente', async () => {
        const current = {
          id: 's1',
          cuenta_cobro_id: 'cuenta-1',
          tipo_servicio_id: 'tipo-1',
          numero_orden: 'T-CUC-12345',
          descripcion_especifica: 'Traslado observado',
          valor_cobrado: 10_000,
          estado: 'Observado',
          created_at: new Date(),
          updated_at: new Date(),
          cuentas_cobro: { usuario_id: 'u1', radicada: true },
        };
        prisma.servicios.findUnique.mockResolvedValue(current);
        prisma.servicios.findFirst.mockResolvedValue(null);
        prisma.servicios.update.mockResolvedValue({
          ...current,
          numero_orden: 'T-CUC-54321',
          descripcion_especifica: 'Traslado corregido',
          estado: 'Pendiente',
          tipos_servicio: { nombre: 'TRASLADO' },
        });
        prisma.servicios.findMany.mockResolvedValue([{ estado: 'Pendiente' }]);

        const result = await service.updateService('u1', 's1', {
          numero_orden: '54321',
          descripcion_especifica: 'Traslado corregido',
        });

        expect(prisma.servicios.update).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ numero_orden: 'T-CUC-54321', estado: 'Pendiente' }),
        }));
        expect(prisma.cuentas_cobro.update).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ estado: 'Pendiente', fecha_aprobacion: null }),
        }));
        expect(result.numero_orden).toBe('T-CUC-54321');
      });

      it('impide corregir una orden duplicada en la misma cuenta', async () => {
        prisma.servicios.findUnique.mockResolvedValue({
          id: 's1',
          cuenta_cobro_id: 'cuenta-1',
          numero_orden: 'BUC-12345',
          estado: 'Observado',
          cuentas_cobro: { usuario_id: 'u1', radicada: true },
        });
        prisma.servicios.findFirst.mockResolvedValue({ id: 's2' });

        await expect(service.updateService('u1', 's1', {
          numero_orden: '54321',
        })).rejects.toThrow('ya está registrada');
        expect(prisma.servicios.update).not.toHaveBeenCalled();
      });
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

    describe('signAccount', () => {
      const firmaPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

      it('solo guarda la firma del dueño de una cuenta aprobada y radicada', async () => {
        prisma.cuentas_cobro.findFirst.mockResolvedValue({
          id: 'cuenta-1',
          usuario_id: 'u1',
          radicada: true,
          estado: 'Aprobado',
          firma_tecnico: null,
          servicios: [{ estado: 'Aprobado' }],
        });
        prisma.cuentas_cobro.updateMany.mockResolvedValue({ count: 1 });

        const result = await service.signAccount('u1', 'cuenta-1', firmaPng);

        expect(prisma.cuentas_cobro.findFirst).toHaveBeenCalledWith({
          where: { id: 'cuenta-1', usuario_id: 'u1' },
          include: { servicios: { select: { estado: true } } },
        });
        expect(prisma.cuentas_cobro.updateMany).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ estado: 'Aprobado', radicada: true, firma_tecnico: null }),
          data: expect.objectContaining({ firma_tecnico: firmaPng }),
        }));
        expect(result.firma_tecnico).toBe(firmaPng);
      });

      it('rechaza cuentas que todavía no han sido aprobadas', async () => {
        prisma.cuentas_cobro.findFirst.mockResolvedValue({
          id: 'cuenta-1',
          usuario_id: 'u1',
          radicada: true,
          estado: 'Pendiente',
          firma_tecnico: null,
          servicios: [{ estado: 'Pendiente' }],
        });

        await expect(service.signAccount('u1', 'cuenta-1', firmaPng)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.cuentas_cobro.updateMany).not.toHaveBeenCalled();
      });

      it('no permite firmar si hay servicios de la cuenta sin aprobar', async () => {
        prisma.cuentas_cobro.findFirst.mockResolvedValue({
          id: 'cuenta-1',
          usuario_id: 'u1',
          radicada: true,
          estado: 'Aprobado',
          firma_tecnico: null,
          servicios: [{ estado: 'Aprobado' }, { estado: 'Observado' }],
        });

        await expect(service.signAccount('u1', 'cuenta-1', firmaPng)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.cuentas_cobro.updateMany).not.toHaveBeenCalled();
      });

      it('rechaza contenido que no sea una imagen PNG', async () => {
        await expect(service.signAccount('u1', 'cuenta-1', 'data:image/png;base64,abc')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });
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

  describe('quoteTransfer', () => {
    it('uses the same server tariff calculation as transfer creation', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({ sede: 'Cucuta' });
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        ...TIPO,
        valor_estandar: '55000',
      });
      transportCalculator.calculateTransferValue.mockReturnValue(135_000);

      const quote = await service.quoteTransfer(
        'u1',
        {
          tipo_servicio_id: 'traslado-pamplona',
          numero_orden: '12345',
          destino: 'PAMPLONA',
          transporte: 'VEHICULO_EMPRESA',
        },
        [{ id: 's1', valor_cobrado: 50_000, tipo_servicio_id: 'tipo-1' }],
      );

      expect(transportCalculator.calculateTransferValue).toHaveBeenCalledWith(
        'VEHICULO_EMPRESA',
        'PAMPLONA',
        [{ id: 's1', valor_cobrado: 50_000, tipo_servicio_id: 'tipo-1' }],
        55_000,
      );
      expect(quote).toEqual({ valor_cobrado: 135_000 });
    });
  });

  describe('deleteService', () => {
    it('elimina la orden y su traslado durante la corrección, conservando al menos otra orden', async () => {
      prisma.servicios.findUnique.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        numero_orden: 'BUC-12345',
        cuentas_cobro: { usuario_id: 'u1', radicada: true, estado: 'Observado' },
      });
      prisma.servicios.findMany.mockResolvedValue([
        { id: 's1', numero_orden: 'BUC-12345' },
        { id: 's2', numero_orden: 'T-BUC-12345' },
        { id: 's3', numero_orden: 'BUC-54321' },
      ]);
      prisma.servicios.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.deleteService('u1', 's1');

      expect(prisma.servicios.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['s1', 's2'] }, cuenta_cobro_id: 'cuenta-1' },
      });
      expect(result).toEqual({ deleted: true, cuentaEliminada: false });
    });

    it('impide eliminar la última orden de una cuenta en corrección', async () => {
      prisma.servicios.findUnique.mockResolvedValue({
        id: 's1',
        cuenta_cobro_id: 'cuenta-1',
        numero_orden: 'BUC-12345',
        cuentas_cobro: { usuario_id: 'u1', radicada: true, estado: 'Observado' },
      });
      prisma.servicios.findMany.mockResolvedValue([
        { id: 's1', numero_orden: 'BUC-12345' },
      ]);

      await expect(service.deleteService('u1', 's1')).rejects.toThrow('al menos una orden');
      expect(prisma.servicios.deleteMany).not.toHaveBeenCalled();
    });

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

  describe('submitAccountCorrection', () => {
    it('devuelve los servicios y la cuenta a pendiente para una nueva revisión', async () => {
      prisma.cuentas_cobro.findFirst.mockResolvedValue({
        id: 'cuenta-1',
        usuario_id: 'u1',
        radicada: true,
        estado: 'Observado',
        servicios: [{ id: 's1' }],
      });

      const result = await service.submitAccountCorrection('u1', 'cuenta-1');

      expect(prisma.servicios.updateMany).toHaveBeenCalledWith({
        where: { cuenta_cobro_id: 'cuenta-1' },
        data: expect.objectContaining({ estado: 'Pendiente' }),
      });
      expect(prisma.cuentas_cobro.update).toHaveBeenCalledWith({
        where: { id: 'cuenta-1' },
        data: expect.objectContaining({
          estado: 'Pendiente',
          firma_tecnico: null,
          fecha_firma: null,
        }),
      });
      expect(result).toEqual({ id: 'cuenta-1', estado: 'Pendiente', radicada: true });
    });
  });
});
