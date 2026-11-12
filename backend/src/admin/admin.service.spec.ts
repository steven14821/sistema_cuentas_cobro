import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';
import { ApprovalEmailService } from './approval-email.service';
import { TransportCalculatorService } from '../services/transport-calculator.service';

function makePrisma() {
  return {
    usuarios: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditoria_servicios: {
      count: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    tipos_servicio: {
      findUnique: vi.fn(),
    },
    excepciones_carga: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    cuentas_cobro: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    servicios: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      return cb(prisma);
    }),
  } as any;
}

let prisma: any;
let service: AdminService;
let approvalEmail: { sendAccountApproved: ReturnType<typeof vi.fn> };

describe('AdminService — deleteUser', () => {
  beforeEach(() => {
    prisma = makePrisma();
    approvalEmail = { sendAccountApproved: vi.fn().mockResolvedValue({ status: 'sent' }) };
    service = new AdminService(prisma, approvalEmail as unknown as ApprovalEmailService, new TransportCalculatorService());
  });

  describe('AdminService — updateServiceType', () => {
    beforeEach(() => {
      prisma = makePrisma();
      approvalEmail = { sendAccountApproved: vi.fn().mockResolvedValue({ status: 'sent' }) };
      service = new AdminService(prisma, approvalEmail as unknown as ApprovalEmailService, new TransportCalculatorService());
    });

    it('cambia el tipo, aplica la nueva tarifa estándar y deja auditoría', async () => {
      prisma.servicios.findUnique.mockResolvedValue({
        id: 'service-1',
        cuenta_cobro_id: 'account-1',
        tipo_servicio_id: 'type-old',
        numero_orden: 'BUC-12345',
        descripcion_especifica: 'Instalación',
        valor_cobrado: 50000,
        estado: 'Pendiente',
        cuentas_cobro: { radicada: true },
        tipos_servicio: { nombre: 'SAMSUNG: Instalación' },
      });
      prisma.tipos_servicio.findUnique.mockResolvedValue({
        id: 'type-new',
        nombre: 'SAMSUNG: Diagnóstico garantía',
        valor_estandar: 10000,
        activo: true,
      });
      prisma.servicios.update.mockResolvedValue({
        id: 'service-1',
        cuenta_cobro_id: 'account-1',
        tipo_servicio_id: 'type-new',
        numero_orden: 'BUC-12345',
        descripcion_especifica: 'Instalación',
        valor_cobrado: 10000,
        estado: 'Pendiente',
        tipos_servicio: { nombre: 'SAMSUNG: Diagnóstico garantía' },
      });

      const result = await service.updateServiceType('service-1', 'type-new', 'admin-1');

      expect(prisma.servicios.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'service-1' },
        data: expect.objectContaining({ tipo_servicio_id: 'type-new', valor_cobrado: 10000 }),
      }));
      expect(prisma.auditoria_servicios.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          usuario_admin_id: 'admin-1',
          estado_anterior: 'Pendiente',
          estado_nuevo: 'Pendiente',
          observacion: expect.stringContaining('Valor actualizado de 50000 a 10000'),
        }),
      }));
      expect(result.tipo_servicio_nombre).toBe('SAMSUNG: Diagnóstico garantía');
      expect(result.valor_cobrado).toBe(10000);
    });

    it('no permite cambiar el tipo de cuentas aún no radicadas', async () => {
      prisma.servicios.findUnique.mockResolvedValue({
        id: 'service-1',
        cuentas_cobro: { radicada: false },
      });

      await expect(service.updateServiceType('service-1', 'type-new', 'admin-1'))
        .rejects.toThrow('cuenta radicada');
      expect(prisma.servicios.update).not.toHaveBeenCalled();
    });
  });

  describe('AdminService — valor asignado por el administrador', () => {
    const zurich = {
      id: 'service-zurich',
      cuenta_cobro_id: 'account-1',
      tipo_servicio_id: 'type-zurich',
      numero_orden: 'CUC-12345',
      descripcion_especifica: 'Cambio de fuente de poder',
      valor_cobrado: 0,
      estado: 'Pendiente',
      cuentas_cobro: { radicada: true, estado: 'Pendiente' },
      tipos_servicio: {
        nombre: 'ZURICH: Reparación',
        valor_estandar: 0,
        activo: true,
        requiere_valor_admin: true,
      },
    };

    beforeEach(() => {
      prisma = makePrisma();
      approvalEmail = { sendAccountApproved: vi.fn().mockResolvedValue({ status: 'sent' }) };
      service = new AdminService(prisma, approvalEmail as unknown as ApprovalEmailService, new TransportCalculatorService());
    });

    it('asigna el valor, deja auditoría y recalcula el traslado de la misma orden', async () => {
      prisma.servicios.findUnique.mockResolvedValue(zurich);
      prisma.servicios.update.mockResolvedValue({ ...zurich, valor_cobrado: 80_000 });
      prisma.servicios.findFirst.mockResolvedValue({
        id: 'transfer-1',
        numero_orden: 'T-CUC-12345',
        descripcion_especifica: 'Moto propia',
        valor_cobrado: 8_000,
        estado: 'Pendiente',
        tipos_servicio: { nombre: 'TRASLADO CUC: Zulia' },
      });
      prisma.servicios.findMany.mockResolvedValue([]);

      await service.updateServiceValue('service-zurich', 80_000, 'admin-1');

      expect(prisma.servicios.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'service-zurich' },
        data: expect.objectContaining({ valor_cobrado: 80_000 }),
      }));
      expect(prisma.servicios.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'transfer-1' },
        data: expect.objectContaining({ valor_cobrado: 88_000 }),
      }));
      expect(prisma.cuentas_cobro.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { firma_tecnico: null, fecha_firma: null },
      }));
      expect(prisma.auditoria_servicios.create).toHaveBeenCalledTimes(2);
    });

    it('no toca el traslado cuando su tarifa no depende del valor del servicio', async () => {
      prisma.servicios.findUnique.mockResolvedValue({
        ...zurich,
        numero_orden: 'BUC-12345',
      });
      prisma.servicios.update.mockResolvedValue({ ...zurich, valor_cobrado: 80_000 });
      prisma.servicios.findFirst.mockResolvedValue({
        id: 'transfer-1',
        numero_orden: 'T-BUC-12345',
        descripcion_especifica: 'Moto propia',
        valor_cobrado: 8_000,
        estado: 'Pendiente',
        tipos_servicio: { nombre: 'TRASLADO: Piedecuesta' },
      });
      prisma.servicios.findMany.mockResolvedValue([]);

      await service.updateServiceValue('service-zurich', 80_000, 'admin-1');

      expect(prisma.servicios.update).toHaveBeenCalledTimes(1);
    });

    it('rechaza un valor manual en un servicio con tarifa fija', async () => {
      prisma.servicios.findUnique.mockResolvedValue({
        ...zurich,
        tipos_servicio: { ...zurich.tipos_servicio, requiere_valor_admin: false },
      });

      await expect(service.updateServiceValue('service-zurich', 80_000, 'admin-1'))
        .rejects.toThrow('tarifa fija');
      expect(prisma.servicios.update).not.toHaveBeenCalled();
    });

    it('rechaza valores en cero', async () => {
      await expect(service.updateServiceValue('service-zurich', 0, 'admin-1'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.servicios.findUnique).not.toHaveBeenCalled();
    });

    it('impide aprobar un servicio sin valor asignado', async () => {
      prisma.servicios.findUnique.mockResolvedValue(zurich);

      await expect(service.updateServiceStatus('service-zurich', 'Aprobado', 'admin-1'))
        .rejects.toThrow('Asigna el valor de "ZURICH: Reparación" antes de aprobar.');
      expect(prisma.servicios.update).not.toHaveBeenCalled();
    });

    it('impide aprobar la cuenta completa si falta un valor por asignar', async () => {
      prisma.cuentas_cobro.findUnique.mockResolvedValue({
        id: 'account-1',
        radicada: true,
        estado: 'Pendiente',
        servicios: [zurich],
        usuarios: { nombre_completo: 'Técnico', email: 'tecnico@example.com' },
      });

      await expect(service.updateAccountStatus('account-1', 'Aprobado', 'admin-1'))
        .rejects.toThrow('antes de aprobar');
      expect(prisma.servicios.update).not.toHaveBeenCalled();
    });
  });

  describe('AdminService — account access management', () => {
    beforeEach(() => {
      prisma = makePrisma();
      approvalEmail = { sendAccountApproved: vi.fn().mockResolvedValue({ status: 'sent' }) };
      service = new AdminService(prisma, approvalEmail as unknown as ApprovalEmailService, new TransportCalculatorService());
    });

    it('creates a generated password and returns it only with the new user result', async () => {
      prisma.usuarios.findUnique.mockResolvedValue(null);
      prisma.usuarios.create.mockResolvedValue({ id: 'tech-1', username: 'tech' });

      const result = await service.createUser({
        username: 'tech',
        nombre_completo: 'Técnico',
        email: 'tech@example.com',
        password: 'must-be-ignored',
        generate_password: true,
        rol: 'Tecnico',
      });

      expect(result.generatedPassword).toBeTruthy();
      expect(result.generatedPassword).not.toBe('must-be-ignored');
      expect(prisma.usuarios.create.mock.calls[0][0].data.password_hash).not.toBe(result.generatedPassword);
    });

    it('requires a reason before disabling a user', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({ id: 'tech-1', activo: true });

      await expect(service.toggleUserActive('tech-1')).rejects.toThrow(BadRequestException);
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });

    it('stores the reason when disabling a user', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({ id: 'tech-1', activo: true });
      prisma.usuarios.update.mockResolvedValue({ id: 'tech-1', activo: false });

      await service.toggleUserActive('tech-1', 'Cambio de personal');

      expect(prisma.usuarios.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { activo: false, motivo_inactivacion: 'Cambio de personal' },
      }));
    });

    it('generates and stores a one-time random password on reset', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({ id: 'tech-1' });
      prisma.usuarios.update.mockResolvedValue({ id: 'tech-1' });

      const result = await service.resetUserPassword('tech-1');

      expect(result.password).toHaveLength(16);
      expect(prisma.usuarios.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'tech-1' },
        data: expect.objectContaining({ password_hash: expect.any(String) }),
      }));
      expect(prisma.usuarios.update.mock.calls[0][0].data.password_hash).not.toBe(result.password);
    });

    it('saves an admin-selected password as a hash for a technician', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({ id: 'tech-1', rol: 'Tecnico' });
      prisma.usuarios.update.mockResolvedValue({ id: 'tech-1' });

      await expect(service.updateUserPassword('tech-1', 'clave-nueva')).resolves.toEqual({ success: true });

      const passwordHash = prisma.usuarios.update.mock.calls[0][0].data.password_hash;
      expect(passwordHash).not.toBe('clave-nueva');
      await expect(bcrypt.compare('clave-nueva', passwordHash)).resolves.toBe(true);
    });

    it('does not allow setting a password for an administrator through the technician action', async () => {
      prisma.usuarios.findUnique.mockResolvedValue({ id: 'admin-2', rol: 'Admin' });

      await expect(service.updateUserPassword('admin-2', 'clave-nueva')).rejects.toThrow(BadRequestException);
      expect(prisma.usuarios.update).not.toHaveBeenCalled();
    });
  });

  it('rechaza eliminar el propio usuario en sesión', async () => {
    await expect(service.deleteUser('admin-1', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('lanza NotFoundException si el usuario no existe', async () => {
    prisma.usuarios.findUnique.mockResolvedValue(null);

    await expect(service.deleteUser('unknown-id', 'admin-1')).rejects.toThrow(NotFoundException);
  });

  it('impide eliminar administradores con auditoría contable histórica', async () => {
    prisma.usuarios.findUnique.mockResolvedValue({ id: 'admin-2', rol: 'Admin' });
    prisma.auditoria_servicios.count.mockResolvedValue(3);
    prisma.excepciones_carga.count.mockResolvedValue(0);

    await expect(service.deleteUser('admin-2', 'admin-1')).rejects.toThrow(BadRequestException);
  });

  it('elimina usuario y registros dependientes correctamente', async () => {
    prisma.usuarios.findUnique.mockResolvedValue({ id: 'tech-1', rol: 'Tecnico' });
    prisma.auditoria_servicios.count.mockResolvedValue(0);
    prisma.excepciones_carga.count.mockResolvedValue(0);
    prisma.cuentas_cobro.findMany.mockResolvedValue([{ id: 'cuenta-1' }]);
    prisma.servicios.findMany.mockResolvedValue([{ id: 'servicio-1' }]);

    const res = await service.deleteUser('tech-1', 'admin-1');

    expect(res).toEqual({ success: true, message: 'Usuario eliminado exitosamente.' });
    expect(prisma.excepciones_carga.deleteMany).toHaveBeenCalledWith({ where: { usuario_id: 'tech-1' } });
    expect(prisma.auditoria_servicios.deleteMany).toHaveBeenCalledWith({ where: { servicio_id: { in: ['servicio-1'] } } });
    expect(prisma.servicios.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['servicio-1'] } } });
    expect(prisma.cuentas_cobro.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['cuenta-1'] } } });
    expect(prisma.usuarios.delete).toHaveBeenCalledWith({ where: { id: 'tech-1' } });
  });

  it('envía un correo con período y técnico al aprobar una cuenta por primera vez', async () => {
    prisma.cuentas_cobro.findUnique
      .mockResolvedValueOnce({
        id: 'account-1',
        estado: 'Pendiente',
        radicada: true,
        mes: 10,
        anio: 2026,
        usuarios: { nombre_completo: 'Técnico Uno', email: 'tech@example.com' },
        servicios: [{ id: 'service-1', estado: 'Pendiente' }],
      })
      .mockResolvedValueOnce({
        id: 'account-1',
        usuario_id: 'tech-1',
        tecnico: 'Técnico Uno',
        tecnico_email: 'tech@example.com',
        mes: 10,
        anio: 2026,
        estado: 'Aprobado',
        radicada: true,
        servicios: [],
      });

    await service.updateAccountStatus('account-1', 'Aprobado', 'admin-1');

    expect(approvalEmail.sendAccountApproved).toHaveBeenCalledWith({
      email: 'tech@example.com',
      technician: 'Técnico Uno',
      month: 10,
      year: 2026,
    });
  });

  it('does not send another approval email when the account was already approved', async () => {
    prisma.cuentas_cobro.findUnique
      .mockResolvedValueOnce({
        id: 'account-1',
        estado: 'Aprobado',
        radicada: true,
        mes: 10,
        anio: 2026,
        usuarios: { nombre_completo: 'Técnico Uno', email: 'tech@example.com' },
        servicios: [{ id: 'service-1', estado: 'Aprobado' }],
      })
      .mockResolvedValueOnce({
        id: 'account-1',
        usuario_id: 'tech-1',
        tecnico: 'Técnico Uno',
        tecnico_email: 'tech@example.com',
        mes: 10,
        anio: 2026,
        estado: 'Aprobado',
        radicada: true,
        servicios: [],
      });

    await service.updateAccountStatus('account-1', 'Aprobado', 'admin-1');

    expect(approvalEmail.sendAccountApproved).not.toHaveBeenCalled();
  });

  it('sends an approval notice when the last individual service becomes approved', async () => {
    prisma.servicios.findUnique.mockResolvedValue({
      id: 'service-1',
      cuenta_cobro_id: 'account-1',
      estado: 'Pendiente',
      cuentas_cobro: {
        mes: 10,
        anio: 2026,
        usuarios: { nombre_completo: 'Técnico Uno', email: 'tech@example.com' },
      },
    });
    prisma.servicios.update.mockResolvedValue({
      id: 'service-1',
      cuenta_cobro_id: 'account-1',
      tipo_servicio_id: 'type-1',
      numero_orden: 'BUC-12345',
      descripcion_especifica: null,
      valor_cobrado: 50000,
      estado: 'Aprobado',
    });
    prisma.cuentas_cobro.findUnique.mockResolvedValue({ estado: 'Pendiente' });
    prisma.servicios.findMany.mockResolvedValue([{ estado: 'Aprobado' }]);

    const result = await service.updateServiceStatus('service-1', 'Aprobado', 'admin-1');

    expect(approvalEmail.sendAccountApproved).toHaveBeenCalledWith({
      email: 'tech@example.com',
      technician: 'Técnico Uno',
      month: 10,
      year: 2026,
    });
    expect(result.email_notification).toEqual({ status: 'sent' });
  });
});

describe('AdminService — auditoría de tarifas en el detalle de cuenta', () => {
  beforeEach(() => {
    prisma = makePrisma();
    approvalEmail = { sendAccountApproved: vi.fn() };
    service = new AdminService(prisma, approvalEmail as unknown as ApprovalEmailService, new TransportCalculatorService());
  });

  it('expone la auditoría por servicio y el resumen de la cuenta', async () => {
    prisma.cuentas_cobro.findUnique.mockResolvedValue({
      id: 'account-1',
      usuario_id: 'tech-1',
      usuarios: { nombre_completo: 'Técnico Uno', email: 'tech@example.com', sede: 'Bucaramanga' },
      mes: 11,
      anio: 2026,
      estado: 'Pendiente',
      radicada: true,
      servicios: [
        {
          id: 's1',
          numero_orden: 'BUC-12345',
          descripcion_especifica: 'Cambio de panel',
          valor_cobrado: 20000,
          estado: 'Pendiente',
          tipos_servicio: { nombre: 'SAMSUNG: Reparación TV', valor_estandar: 20000, activo: true },
        },
        {
          id: 's2',
          numero_orden: 'BUC-22222',
          descripcion_especifica: null,
          valor_cobrado: 35000,
          estado: 'Pendiente',
          tipos_servicio: { nombre: 'SAMSUNG: Reparación TV', valor_estandar: 20000, activo: true },
        },
        {
          id: 's3',
          numero_orden: 'T-BUC-33333',
          descripcion_especifica: 'Traslado: Chía',
          valor_cobrado: 15000,
          estado: 'Pendiente',
          tipos_servicio: { nombre: 'TRASLADO: Moto propia', valor_estandar: 0, activo: true },
        },
      ],
    });

    const result = await service.getAccountById('account-1');

    expect(result.auditoria_tarifas).toEqual({ coincidencias: 1, diferencias: 1, revision_manual: 1 });
    expect(result.servicios[0].auditoria_tarifa.status).toBe('match');
    expect(result.servicios[1].auditoria_tarifa).toMatchObject({
      status: 'mismatch',
      expected: 20000,
      difference: 15000,
    });
    expect(result.servicios[2].auditoria_tarifa.status).toBe('manual_review');
  });
});
