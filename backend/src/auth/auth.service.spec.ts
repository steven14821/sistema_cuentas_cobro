import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = {
    id: 'user-1',
    username: 'tecnico1',
    email: 'tecnico@example.com',
    nombre_completo: 'Técnico Uno',
    rol: 'Tecnico',
    sede: 'Bucaramanga',
    activo: true,
    password_hash: '',
  };
  const prisma = {
    usuarios: { findFirst: vi.fn() },
  };
  const jwtService = { sign: vi.fn(() => 'token') };
  let service: AuthService;

  beforeEach(async () => {
    user.password_hash = await bcrypt.hash('correct-password', 1);
    prisma.usuarios.findFirst.mockResolvedValue(user);
    service = new AuthService(prisma as never, jwtService as never);
  });

  it.each(['tecnico1', 'tecnico@example.com'])(
    'allows login with username or email (%s)',
    async (identifier) => {
      const result = await service.login(identifier, 'correct-password');

      expect(prisma.usuarios.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ username: identifier }, { email: identifier }] },
      });
      expect(result.accessToken).toBe('token');
      expect(result.user.id).toBe('user-1');
    },
  );
});
