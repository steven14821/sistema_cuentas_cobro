import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    const { email, password } = body;
    if (!email || !password) {
      throw new UnauthorizedException('Email y contraseña son requeridos');
    }
    return this.authService.login(email, password);
  }
}
