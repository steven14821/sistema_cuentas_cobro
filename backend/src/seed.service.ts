import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedService {
  constructor(private prisma: PrismaService) {}

  async seed() {
    const passwordHash = await bcrypt.hash('password123', 10);

    const users = [
      {
        username: 'admin',
        password_hash: passwordHash,
        nombre_completo: 'Administrador del Sistema',
        email: 'admin@em.com',
        rol: 'Admin' as any,
      },
      {
        username: 'tecnico1',
        password_hash: passwordHash,
        nombre_completo: 'Juan Técnico',
        email: 'tech@em.com',
        rol: 'Tecnico' as any,
      },
    ];

    for (const user of users) {
      const existing = await this.prisma.usuarios.findUnique({
        where: { email: user.email },
      });
      if (existing) {
        await this.prisma.usuarios.update({
          where: { id: existing.id },
          data: user,
        });
      } else {
        await this.prisma.usuarios.upsert({
          where: { username: user.username },
          update: {},
          create: user,
        });
      }
    }
    console.log('✅ Usuarios de prueba creados con éxito.');
  }
}
