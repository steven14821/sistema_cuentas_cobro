import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AdminService, type EstadoServicio } from './admin.service';
import { UpdateUserPasswordDto } from './dto/update-user-password.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { UpdateServiceValueDto } from './dto/update-service-value.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('pending-services')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async getPending() {
    return this.adminService.getPendingServices();
  }

  @Patch('services/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { status: EstadoServicio; observacion?: string },
  ) {
    return this.adminService.updateServiceStatus(id, body.status, req.user!.id, body.observacion);
  }

  @Patch('services/:id/type')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async updateServiceType(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateServiceTypeDto,
  ) {
    return this.adminService.updateServiceType(id, body.tipo_servicio_id, req.user!.id);
  }

  @Patch('services/:id/value')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async updateServiceValue(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateServiceValueDto,
  ) {
    return this.adminService.updateServiceValue(id, body.valor_cobrado, req.user!.id);
  }

  // ---- Cuentas de cobro radicadas ----

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async getDashboard() {
    return this.adminService.getDashboardSummary();
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async getAccounts(
    @Query('mes') mes?: string,
    @Query('anio') anio?: string,
    @Query('estado') estado?: EstadoServicio,
    @Query('usuario_id') usuarioId?: string,
  ) {
    return this.adminService.getAccounts({
      mes: mes ? Number(mes) : undefined,
      anio: anio ? Number(anio) : undefined,
      estado,
      usuario_id: usuarioId,
    });
  }

  @Get('accounts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async getAccountById(@Param('id') id: string) {
    return this.adminService.getAccountById(id);
  }

  @Patch('accounts/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async updateAccountStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { status: EstadoServicio; observacion?: string },
  ) {
    return this.adminService.updateAccountStatus(id, body.status, req.user!.id, body.observacion);
  }

  // ---- Excepciones ----

  @Get('exceptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async listExceptions() {
    return this.adminService.getExceptions();
  }

  @Post('exceptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async createException(
    @Request() req: any,
    @Body() body: { usuario_id: string; fecha_vencimiento: string; motivo?: string },
  ) {
    return this.adminService.createException(body.usuario_id, new Date(body.fecha_vencimiento), req.user!.id, body.motivo);
  }

  @Delete('exceptions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async deleteException(@Param('id') id: string) {
    return this.adminService.deleteException(id);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async createUser(@Body() data: {
    username: string;
    nombre_completo: string;
    email: string;
    password: string;
    generate_password?: boolean;
    rol: 'Tecnico' | 'Admin';
    sede?: string;
  }) {
    return this.adminService.createUser(data);
  }

  @Get('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async getUser(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { username?: string; nombre_completo?: string; email?: string; sede?: string | null },
  ) {
    return this.adminService.updateUser(id, body);
  }

  @Post('users/:id/reset-password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async resetUserPassword(@Param('id') id: string) {
    return this.adminService.resetUserPassword(id);
  }

  @Patch('users/:id/password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async updateUserPassword(
    @Param('id') id: string,
    @Body() body: UpdateUserPasswordDto,
  ) {
    return this.adminService.updateUserPassword(id, body.password);
  }

  @Patch('users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async updateUserRole(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { rol: 'Tecnico' | 'Admin' },
  ) {
    return this.adminService.updateUserRole(id, body.rol, req.user!.id);
  }

  @Post('users/:id/toggle-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async toggleActive(@Request() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.adminService.toggleUserActive(id, body.reason, req.user!.id);
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Admin')
  async deleteUser(@Request() req: any, @Param('id') id: string) {
    return this.adminService.deleteUser(id, req.user!.id);
  }
}
