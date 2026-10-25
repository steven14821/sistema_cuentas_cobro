import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { TransportCalculatorService, TransportType } from './transport-calculator.service';
import {
  getColombiaToday,
  getPeriodoARadicar,
  isVentanaAbierta,
  toUtcDate,
} from './period.util';

@Injectable()
export class ServicesService {
  constructor(
    private prisma: PrismaService,
    private transportCalculator: TransportCalculatorService,
  ) {}

  // ---- Utilidades internas ----

  // Regla de Oro: solo días 1-5, salvo excepción vigente para el técnico.
  private async assertVentanaAbierta(usuarioId: string): Promise<void> {
    const hoy = getColombiaToday();
    if (isVentanaAbierta(hoy.dia)) return;

    const excepcion = await this.prisma.excepciones_carga.findFirst({
      where: {
        usuario_id: usuarioId,
        fecha_vencimiento: { gte: toUtcDate(hoy) },
      },
    });

    if (!excepcion) {
      throw new ForbiddenException(
        'Carga extemporánea: Solo se pueden registrar servicios del 1 al 5 de cada mes. Solicite una excepción al administrador.',
      );
    }
  }

  private serializeServicio(servicio: any) {
    return {
      id: servicio.id,
      cuenta_cobro_id: servicio.cuenta_cobro_id,
      tipo_servicio_id: servicio.tipo_servicio_id,
      tipo_servicio_nombre: servicio.tipos_servicio?.nombre ?? null,
      numero_orden: servicio.numero_orden,
      descripcion_especifica: servicio.descripcion_especifica,
      valor_cobrado: Number(servicio.valor_cobrado),
      estado: servicio.estado,
      created_at: servicio.created_at,
      updated_at: servicio.updated_at,
    };
  }

  private serializeCuenta(cuenta: any) {
    const servicios = (cuenta.servicios ?? []).map((s: any) =>
      this.serializeServicio(s),
    );
    const total = servicios.reduce(
      (acc: number, s: { valor_cobrado: number }) => acc + s.valor_cobrado,
      0,
    );

    const serviciosPrincipales = servicios.filter(
      (s: { numero_orden: string }) => !s.numero_orden.startsWith('T-'),
    );

    return {
      id: cuenta.id,
      usuario_id: cuenta.usuario_id,
      tecnico: cuenta.usuarios?.nombre_completo ?? null,
      mes: cuenta.mes,
      anio: cuenta.anio,
      estado: cuenta.estado,
      radicada: cuenta.radicada,
      fecha_creacion: cuenta.fecha_creacion,
      fecha_aprobacion: cuenta.fecha_aprobacion,
      total,
      total_servicios: serviciosPrincipales.length,
      servicios,
    };
  }

  // ---- API del técnico ----

  async createService(usuarioId: string, dto: CreateServiceDto) {
    await this.assertVentanaAbierta(usuarioId);

    const tipo = await this.prisma.tipos_servicio.findUnique({
      where: { id: dto.tipo_servicio_id },
    });
    if (!tipo || !tipo.activo) {
      throw new BadRequestException(
        'El tipo de servicio no existe o está inactivo.',
      );
    }

    const periodo = getPeriodoARadicar(getColombiaToday());

    let cuenta = await this.prisma.cuentas_cobro.findUnique({
      where: {
        usuario_id_mes_anio: {
          usuario_id: usuarioId,
          mes: periodo.mes,
          anio: periodo.anio,
        },
      },
    });

    if (cuenta?.radicada) {
      throw new BadRequestException(
        'La cuenta de este período ya fue radicada y no admite cambios.',
      );
    }

    if (!cuenta) {
      cuenta = await this.prisma.cuentas_cobro.create({
        data: {
          usuario_id: usuarioId,
          mes: periodo.mes,
          anio: periodo.anio,
          estado: 'Pendiente',
          radicada: false,
        },
      });
    }

    const user = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: { sede: true },
    });
    const prefix = user?.sede?.toLowerCase().includes('cuc') ? 'CUC' : 'BUC';
    const rawDigits = dto.numero_orden.replace(/^(BUC|CUC)-/i, '').trim();
    const numeroOrden = `${prefix}-${rawDigits}`;

    const duplicado = await this.prisma.servicios.findFirst({
      where: { cuenta_cobro_id: cuenta.id, numero_orden: numeroOrden },
    });
    if (duplicado) {
      throw new BadRequestException(
        `La orden ${numeroOrden} ya fue registrada en esta cuenta.`,
      );
    }

    // El valor lo define el tipo de servicio (no el cliente).
    const servicio = await this.prisma.servicios.create({
      data: {
        cuenta_cobro_id: cuenta.id,
        tipo_servicio_id: tipo.id,
        numero_orden: numeroOrden,
        descripcion_especifica: dto.descripcion_especifica ?? null,
        valor_cobrado: tipo.valor_estandar,
        estado: 'Pendiente',
      },
      include: { tipos_servicio: true },
    });

    return this.serializeServicio(servicio);
  }

  async createTransfer(
    usuarioId: string,
    dto: CreateTransferDto,
    currentServices: { id: string; valor_cobrado: number; tipo_servicio_id: string }[] = [],
  ) {
    await this.assertVentanaAbierta(usuarioId);

    const periodo = getPeriodoARadicar(getColombiaToday());

    let cuenta = await this.prisma.cuentas_cobro.findUnique({
      where: {
        usuario_id_mes_anio: {
          usuario_id: usuarioId,
          mes: periodo.mes,
          anio: periodo.anio,
        },
      },
    });

    if (!cuenta) {
      throw new BadRequestException(
        'No se ha creado una cuenta para este período.',
      );
    }
    if (cuenta.radicada) {
      throw new BadRequestException('La cuenta ya fue radicada.');
    }

    const user = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: { sede: true },
    });
    const isCucuta = user?.sede?.toLowerCase().includes('cuc') ?? false;

    if (!isCucuta && dto.transporte !== 'MOTO_PROPIA') {
      throw new BadRequestException(
        'Solo los técnicos de Cúcuta pueden registrar traslados en vehículo empresa.',
      );
    }

    const transportType =
      dto.transporte === 'MOTO_PROPIA'
        ? TransportType.MOTO
        : TransportType.VEHICLE;

    const tipo = await this.prisma.tipos_servicio.findUnique({
      where: { id: dto.tipo_servicio_id },
    });
    if (!tipo || !tipo.activo) {
      throw new BadRequestException(
        'El tipo de servicio de este traslado no existe o está inactivo.',
      );
    }

    const calculatedValue = this.transportCalculator.calculateTransferValue(
      transportType,
      dto.destino,
      currentServices,
      Number(tipo.valor_estandar),
    );

    if (calculatedValue === 0) {
      throw new BadRequestException(
        `No hay tarifa o regla de traslado reconocida para el destino "${dto.destino}" ` +
          `con transporte "${dto.transporte}".`,
      );
    }

    if (dto.valor_cobrado !== undefined && Math.abs(dto.valor_cobrado - calculatedValue) > 1) {
      throw new BadRequestException(
        `El valor enviado (${dto.valor_cobrado}) no coincide con el calculado por el sistema (${calculatedValue}).`,
      );
    }

    const prefix = isCucuta ? 'CUC' : 'BUC';
    const rawDigits = dto.numero_orden.replace(/^(T-)?(BUC|CUC)-/i, '').trim();
    const numeroOrden = `T-${prefix}-${rawDigits}`;

    const duplicado = await this.prisma.servicios.findFirst({
      where: {
        cuenta_cobro_id: cuenta.id,
        numero_orden: numeroOrden,
      },
    });
    if (duplicado) {
      throw new BadRequestException(
        `La orden ${numeroOrden} ya fue registrada en esta cuenta.`,
      );
    }

    const servicio = await this.prisma.servicios.create({
      data: {
        cuenta_cobro_id: cuenta.id,
        tipo_servicio_id: dto.tipo_servicio_id,
        numero_orden: numeroOrden,
        descripcion_especifica: dto.descripcion_especifica ?? null,
        valor_cobrado: calculatedValue,
        estado: 'Pendiente',
      },
      include: { tipos_servicio: true },
    });

    return {
      servicio: this.serializeServicio(servicio),
      valor_cobrado: calculatedValue,
    };
  }

  async deleteService(usuarioId: string, servicioId: string) {
    const servicio = await this.prisma.servicios.findUnique({
      where: { id: servicioId },
      include: { cuentas_cobro: true },
    });

    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (servicio.cuentas_cobro.usuario_id !== usuarioId) {
      throw new ForbiddenException(
        'No puedes eliminar un servicio de otra cuenta.',
      );
    }
    if (servicio.cuentas_cobro.radicada) {
      throw new BadRequestException(
        'La cuenta ya fue radicada; no se pueden eliminar servicios.',
      );
    }

    await this.assertVentanaAbierta(usuarioId);

    await this.prisma.servicios.delete({ where: { id: servicioId } });

    // Si la cuenta quedó vacía, se elimina para no dejar borradores huérfanos.
    const restantes = await this.prisma.servicios.count({
      where: { cuenta_cobro_id: servicio.cuenta_cobro_id },
    });
    if (restantes === 0) {
      await this.prisma.cuentas_cobro.delete({
        where: { id: servicio.cuenta_cobro_id },
      });
      return { deleted: true, cuentaEliminada: true };
    }

    return { deleted: true, cuentaEliminada: false };
  }

  async updateService(usuarioId: string, servicioId: string, dto: UpdateServiceDto) {
    const servicio = await this.prisma.servicios.findUnique({
      where: { id: servicioId },
      include: { cuentas_cobro: true },
    });

    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado.');
    }
    if (servicio.cuentas_cobro.usuario_id !== usuarioId) {
      throw new ForbiddenException('No puedes editar un servicio de otra cuenta.');
    }

    // Solo se permite editar si la cuenta NO está radicada,
    // O si el servicio está en estado 'Rechazado' u 'Observado'.
    const isRadicada = servicio.cuentas_cobro.radicada;
    const isEditableState = ['Rechazado', 'Observado'].includes(servicio.estado as string);

    if (isRadicada && !isEditableState) {
      throw new BadRequestException('Solo puedes editar servicios rechazados u observados una vez radicada la cuenta.');
    }

    // Si es un borrador (no radicada), verificamos la ventana de carga.
    if (!isRadicada) {
      await this.assertVentanaAbierta(usuarioId);
    }

    const updated = await this.prisma.servicios.update({
      where: { id: servicioId },
      data: {
        tipo_servicio_id: dto.tipo_servicio_id,
        numero_orden: dto.numero_orden,
        descripcion_especifica: dto.descripcion_especifica,
        updated_at: new Date(),
        // Al editar un servicio rechazado/observado, vuelve a 'Pendiente' para que el admin lo revise de nuevo.
        estado: isEditableState ? 'Pendiente' : servicio.estado,
      },
    });

    return this.serializeServicio(updated);
  }

  async getMyAccount(usuarioId: string) {
    const hoy = getColombiaToday();
    const ventanaAbierta = isVentanaAbierta(hoy.dia);

    const excepcion = await this.prisma.excepciones_carga.findFirst({
      where: {
        usuario_id: usuarioId,
        fecha_vencimiento: { gte: toUtcDate(hoy) },
      },
      orderBy: { fecha_vencimiento: 'desc' },
    });

    const periodo = getPeriodoARadicar(hoy);
    const cuenta = await this.prisma.cuentas_cobro.findUnique({
      where: {
        usuario_id_mes_anio: {
          usuario_id: usuarioId,
          mes: periodo.mes,
          anio: periodo.anio,
        },
      },
      include: {
        servicios: {
          include: { tipos_servicio: true },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    const serializedCuenta = cuenta ? this.serializeCuenta(cuenta) : null;
    const puedeEditar = (ventanaAbierta || !!excepcion) && (!serializedCuenta || !serializedCuenta.radicada);

    return {
      periodo,
      cuenta: serializedCuenta,
      ventanaAbierta,
      tieneExcepcion: !!excepcion,
      excepcion: excepcion
        ? {
            id: excepcion.id,
            fecha_vencimiento: excepcion.fecha_vencimiento,
            motivo: excepcion.motivo,
          }
        : null,
      puedeEditar,
    };
  }

  async radicarAccount(usuarioId: string) {
    const periodo = getPeriodoARadicar(getColombiaToday());
    const cuenta = await this.prisma.cuentas_cobro.findUnique({
      where: {
        usuario_id_mes_anio: {
          usuario_id: usuarioId,
          mes: periodo.mes,
          anio: periodo.anio,
        },
      },
      include: { servicios: true },
    });

    if (!cuenta) {
      throw new BadRequestException('No hay servicios registrados en este período.');
    }
    if (cuenta.radicada) {
      throw new BadRequestException('La cuenta de este período ya fue radicada.');
    }
    if (cuenta.servicios.length === 0) {
      throw new BadRequestException('No hay servicios registrados en este período.');
    }

    const updated = await this.prisma.cuentas_cobro.update({
      where: { id: cuenta.id },
      data: { radicada: true },
    });

    return {
      id: updated.id,
      mes: updated.mes,
      anio: updated.anio,
      estado: updated.estado,
      radicada: updated.radicada,
    };
  }

  async getAllTypes() {
    const tipos = await this.prisma.tipos_servicio.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });

    return tipos.map((t: any) => ({
      id: t.id,
      nombre: t.nombre,
      descripcion: t.descripcion,
      valor_estandar: Number(t.valor_estandar),
      activo: t.activo,
    }));
  }

  async getMyAccounts(usuarioId: string) {
    const cuentas = await this.prisma.cuentas_cobro.findMany({
      where: { usuario_id: usuarioId, radicada: true },
      include: {
        servicios: {
          include: { tipos_servicio: true },
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    return cuentas.map((c: any) => this.serializeCuenta(c));
  }
}
