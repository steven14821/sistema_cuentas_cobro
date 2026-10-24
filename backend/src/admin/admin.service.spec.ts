import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

function makePrisma() {
  return {
    usuarios: {
      findUnique: vi.fn(),
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
