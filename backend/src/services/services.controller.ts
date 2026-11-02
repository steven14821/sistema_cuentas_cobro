import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Patch,
  UseGuards,
  Request,
  Param,
  BadRequestException,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { SignAccountDto } from './dto/sign-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get('types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico', 'Admin')
  async getTypes() {
    return this.servicesService.getAllTypes();
  }

  @Get('my-account')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async getMyAccount(@Request() req: any) {
    return this.servicesService.getMyAccount(req.user!.id);
  }

  @Get('my-accounts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async getMyAccounts(@Request() req: any) {
    return this.servicesService.getMyAccounts(req.user!.id);
  }

  @Post('my-accounts/:id/signature')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async signAccount(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: SignAccountDto,
  ) {
    return this.servicesService.signAccount(req.user!.id, id, dto.firma_tecnico);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async create(@Request() req: any, @Body() dto: CreateServiceDto) {
    return this.servicesService.createService(req.user!.id, dto);
  }

  @Post('transfer/quote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async quoteTransfer(
    @Request() req: any,
    @Body() dto: CreateTransferDto,
  ) {
    const account = await this.servicesService.getMyAccount(req.user!.id);
    if (!account.cuenta) {
      throw new BadRequestException(
        'No hay una cuenta de cobro abierta para este período.',
      );
    }
    const pendingServices = account.cuenta.servicios.filter(
      (service: { estado?: string | null }) =>
        !['Aprobado', 'Observado', 'Rechazado'].includes(service.estado ?? ''),
    );
    return this.servicesService.quoteTransfer(req.user!.id, dto, pendingServices);
  }

  @Post('transfer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async createTransfer(
    @Request() req: any,
    @Body() dto: CreateTransferDto,
  ) {
    const account = await this.servicesService.getMyAccount(req.user!.id);

    if (!account.cuenta) {
      throw new BadRequestException(
        'No hay una cuenta de cobro abierta para este período.',
      );
    }

    const pendingServices = account.cuenta.servicios.filter(
      (s: { estado?: string | null }) =>
        !['Aprobado', 'Observado', 'Rechazado'].includes(s.estado ?? ''),
    );

    return this.servicesService.createTransfer(
      req.user!.id,
      dto,
      pendingServices.map((s: { id: string; valor_cobrado: number; tipo_servicio_id: string }) => ({
        id: s.id,
        valor_cobrado: s.valor_cobrado,
        tipo_servicio_id: s.tipo_servicio_id,
      })),
    );
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.updateService(req.user!.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.servicesService.deleteService(req.user!.id, id);
  }

  @Post('my-account/radicar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Tecnico')
  async radicar(@Request() req: any) {
    return this.servicesService.radicarAccount(req.user!.id);
  }
}
