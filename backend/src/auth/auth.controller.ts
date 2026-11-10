import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { username?: string; email?: string; password?: string }) {
    const identifier = body.username?.trim() || body.email?.trim();
    const { password } = body;
    if (!identifier || !password) {
      throw new UnauthorizedException('Nombre de usuario y contraseña son requeridos');
    }
    return this.authService.login(identifier, password);
  }
}
