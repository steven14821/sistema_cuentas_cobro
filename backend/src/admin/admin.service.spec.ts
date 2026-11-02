import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminService } from './admin.service';

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
      deleteMany: vi.fn(),
    },
    excepciones_carga: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    cuentas_cobro: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    servicios: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      return cb(prisma);
    }),
  } as any;
}

let prisma: any;
let service: AdminService;

describe('AdminService — deleteUser', () => {
  beforeEach(() => {
    prisma = makePrisma();
    service = new AdminService(prisma);
  });

  describe('AdminService — account access management', () => {
    beforeEach(() => {
      prisma = makePrisma();
      service = new AdminService(prisma);
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
});
