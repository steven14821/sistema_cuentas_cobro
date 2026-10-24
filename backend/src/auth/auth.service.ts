import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.usuarios.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = { sub: user.id, email: user.email, rol: user.rol };
    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        nombre_completo: user.nombre_completo,
        rol: user.rol,
        sede: user.sede ?? 'Bucaramanga',
      },
    };
  }

  async createUser(data: {
    username: string;
    nombre_completo: string;
    email: string;
    password: string;
    rol: 'Tecnico' | 'Admin';
  }) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.usuarios.create({
      data: {
        username: data.username,
        password_hash: passwordHash,
        nombre_completo: data.nombre_completo,
        email: data.email,
        rol: data.rol,
      },
    });
    return {
      id: user.id,
      email: user.email,
      nombre_completo: user.nombre_completo,
      rol: user.rol,
    };
  }

  async updateUserRole(userId: string, rol: 'Tecnico' | 'Admin') {
    const user = await this.prisma.usuarios.update({
      where: { id: userId },
      data: { rol },
    });
    return { id: user.id, rol: user.rol, nombre_completo: user.nombre_completo };
  }
}
