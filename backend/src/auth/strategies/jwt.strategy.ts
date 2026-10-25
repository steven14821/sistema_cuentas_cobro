import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'clave-secreta-super-segura-123',
    });
  }

  async validate(payload: any) {
    this.logger.log(`Validating token for user ID: ${payload?.sub}`);
    this.logger.log(`Payload received: ${JSON.stringify(payload)}`);

    try {
      const user = await this.prisma.usuarios.findUnique({ where: { id: payload.sub } });
      if (!user) {
        this.logger.error(`User NOT found in database for ID: ${payload.sub}`);
        throw new UnauthorizedException('Usuario no encontrado');
      }
      this.logger.log(`User successfully validated: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error(`Error during validation: ${error.message}`);
      throw error;
    }
  }
}
