import { encryptDatosCobro, decryptDatosCobro, type DatosCobro } from './crypto.util';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { TransportCalculatorService, TransportType } from './transport-calculator.service';
import { registerOrderNumber } from './order-registry';
import {
  getColombiaToday,
  getPeriodoARadicar,
  getPeriodoConExcepcion,
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

  private async getPeriodoVigente(
    usuarioId: string,
    hoy = getColombiaToday(),
  ) {
    if (isVentanaAbierta(hoy.dia)) return getPeriodoARadicar(hoy);
    const excepcion = await this.prisma.excepciones_carga.findFirst({
      where: {
        usuario_id: usuarioId,
        fecha_vencimiento: { gte: toUtcDate(hoy) },
      },
    });
    return getPeriodoConExcepcion(hoy, !!excepcion);
  }

  private serializeServicio(servicio: any) {
    return {
      id: servicio.id,
      cuenta_cobro_id: servicio.cuenta_cobro_id,
      tipo_servicio_id: servicio.tipo_servicio_id,
      tipo_servicio_nombre: servicio.tipos_servicio?.nombre ?? null,
      requiere_valor_admin: servicio.tipos_servicio?.requiere_valor_admin ?? false,
      numero_orden: servicio.numero_orden,
      descripcion_especifica: servicio.descripcion_especifica,
      fotos: servicio.fotos ?? [],
      valor_cobrado: Number(servicio.valor_cobrado),
      estado: servicio.estado,
      ultima_observacion: servicio.auditoria_servicios?.[0]?.observacion || null,
      created_at: servicio.created_at,
      updated_at: servicio.updated_at,
    };
  }

  private isCorrectionAccount(cuenta: { radicada: boolean; estado?: string | null }) {
    return cuenta.radicada && ['Observado', 'Rechazado'].includes(cuenta.estado ?? '');
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
      firma_tecnico: cuenta.firma_tecnico ?? null,
      fecha_firma: cuenta.fecha_firma ?? null,
      total,
      total_servicios: serviciosPrincipales.length,
      servicios,
    };
  }

  // ---- API del técnico ----

  async createService(usuarioId: string, dto: CreateServiceDto) {
    const periodo = await this.getPeriodoVigente(usuarioId);
    let cuenta = await this.prisma.cuentas_cobro.findUnique({
      where: {
        usuario_id_mes_anio: {
          usuario_id: usuarioId,
          mes: periodo.mes,
          anio: periodo.anio,
        },
      },
    });
    const isCorrection = !!cuenta && this.isCorrectionAccount(cuenta);
    if (!isCorrection) await this.assertVentanaAbierta(usuarioId);

    const tipo = await this.prisma.tipos_servicio.findUnique({
      where: { id: dto.tipo_servicio_id },
    });
    if (!tipo || !tipo.activo) {
      throw new BadRequestException(
        'El tipo de servicio no existe o está inactivo.',
      );
    }

    const puertasAntiguo = dto.puertas_nevecon_antiguo ?? 0;
    const puertasNuevo = dto.puertas_nevecon_nuevo ?? 0;
    if ([puertasAntiguo, puertasNuevo].some((cantidad) => !Number.isInteger(cantidad) || cantidad < 0 || cantidad > 4)) {
      throw new BadRequestException('La cantidad de puertas desmontadas debe estar entre 0 y 4 por equipo.');
    }
    const puertasDesmontadas = puertasAntiguo + puertasNuevo;
    const nombreTipoNormalizado = tipo.nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const esRecoleccion = /recoleccion|recogida/.test(nombreTipoNormalizado);
    const incluyeAyudante = esRecoleccion && nombreTipoNormalizado.includes('incluye ayudante');
    const requiereAyudante = (dto.requiere_ayudante ?? false) && !incluyeAyudante;
    const esNeveconManoAMano = esRecoleccion && nombreTipoNormalizado.includes('nevecon') &&
      nombreTipoNormalizado.includes('mano a mano');
    if (puertasDesmontadas > 0 && !esNeveconManoAMano) {
      throw new BadRequestException(
        'El desmonte de puertas solo aplica a la recolección de nevecon mano a mano.',
      );
    }
    if (requiereAyudante && !esRecoleccion) {
      throw new BadRequestException(
        'El adicional de ayudante solo aplica a servicios de recolección.',
      );
    }

    const fotosPuertas = dto.fotos_puertas ?? [];
    const fotosAyudante = dto.fotos_ayudante ?? [];
    const fotos = [...(dto.fotos ?? []), ...fotosPuertas, ...fotosAyudante];
    if (
      fotos.length > 10 ||
      fotos.some(
        (foto) =>
          !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(foto) ||
          foto.length > 1_400_000,
      )
    ) {
      throw new BadRequestException('Las fotos deben ser imágenes JPG, PNG o WebP de máximo 1 MB cada una (hasta 10).');
    }
    if (puertasDesmontadas > 0 && fotosPuertas.length === 0) {
      throw new BadRequestException(
        'Agrega al menos una foto de las puertas desmontadas.',
      );
    }
    if (requiereAyudante && fotosAyudante.length === 0) {
      throw new BadRequestException(
        'Agrega al menos una foto del motivo por el que necesitaste ayudante.',
      );
    }

    const detallesRecoleccion: string[] = [];
    if (puertasDesmontadas > 0) {
      detallesRecoleccion.push(
        `Puertas desmontadas: nevecon antiguo ${puertasAntiguo}, nevecon nuevo ${puertasNuevo} (fotos: ${fotosPuertas.length})`,
      );
    }
    if (requiereAyudante) {
      const motivoAyudante = dto.motivo_ayudante?.trim();
      if (!motivoAyudante) {
        throw new BadRequestException('Describe por qué necesitaste ayudante.');
      }
      detallesRecoleccion.push(
        `Ayudante: sí (motivo: ${motivoAyudante}, fotos del motivo: ${fotosAyudante.length})`,
      );
    }
    const descripcion = [
      dto.descripcion_especifica?.trim(),
      detallesRecoleccion.length ? `Recolección: ${detallesRecoleccion.join(', ')}` : null,
    ].filter(Boolean).join(' | ') || null;

    if (cuenta?.radicada && !isCorrection) {
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

    const valorAdicional = puertasDesmontadas * 10_000 + (requiereAyudante ? 10_000 : 0);
    const valorBase = tipo.requiere_valor_admin ? 0 : Number(tipo.valor_estandar);
    const servicio = await this.prisma.$transaction(async (tx) => {
      await registerOrderNumber(tx, rawDigits);
      return tx.servicios.create({
        data: {
          cuenta_cobro_id: cuenta.id,
          tipo_servicio_id: tipo.id,
          numero_orden: numeroOrden,
          descripcion_especifica: descripcion,
          fotos,
          valor_cobrado: valorBase + valorAdicional,
          estado: isCorrection ? 'Observado' : 'Pendiente',
        },
        include: { tipos_servicio: true },
      });
    });

    return this.serializeServicio(servicio);
  }

  private async calculateTransfer(
    usuarioId: string,
    dto: CreateTransferDto,
    currentServices: { id: string; valor_cobrado: number; tipo_servicio_id: string }[],
  ) {
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

    const tipo = await this.prisma.tipos_servicio.findUnique({
      where: { id: dto.tipo_servicio_id },
    });
    if (!tipo || !tipo.activo) {
      throw new BadRequestException(
        'El tipo de servicio de este traslado no existe o está inactivo.',
      );
    }
    const transportType =
      dto.transporte === 'MOTO_PROPIA'
        ? TransportType.MOTO
        : TransportType.VEHICLE;
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

    return { calculatedValue, isCucuta };
  }

  async quoteTransfer(
    usuarioId: string,
    dto: CreateTransferDto,
    currentServices: { id: string; valor_cobrado: number; tipo_servicio_id: string }[] = [],
  ) {
    const { calculatedValue } = await this.calculateTransfer(
      usuarioId,
      dto,
      currentServices,
    );
    return { valor_cobrado: calculatedValue };
  }

  async createTransfer(
    usuarioId: string,
    dto: CreateTransferDto,
    currentServices: { id: string; valor_cobrado: number; tipo_servicio_id: string }[] = [],
  ) {
    const periodo = await this.getPeriodoVigente(usuarioId);

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
    const isCorrection = this.isCorrectionAccount(cuenta);
    if (cuenta.radicada && !isCorrection) {
      throw new BadRequestException('La cuenta ya fue radicada.');
    }
    if (!isCorrection) await this.assertVentanaAbierta(usuarioId);

    const { calculatedValue, isCucuta } = await this.calculateTransfer(
      usuarioId,
      dto,
      currentServices,
    );

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
        estado: isCorrection ? 'Observado' : 'Pendiente',
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
    const isCorrection = this.isCorrectionAccount(servicio.cuentas_cobro);
    if (servicio.cuentas_cobro.radicada && !isCorrection) {
      throw new BadRequestException(
        'La cuenta ya fue radicada; no se pueden eliminar servicios.',
      );
    }

    if (isCorrection) {
      const ordenes = await this.prisma.servicios.findMany({
        where: { cuenta_cobro_id: servicio.cuenta_cobro_id },
        select: { id: true, numero_orden: true },
      });
      const numeroOrden = servicio.numero_orden.replace(/^(T-)?(BUC|CUC)-/i, '');
      const idsOrden = ordenes
        .filter((orden: { numero_orden: string }) =>
          orden.numero_orden.replace(/^(T-)?(BUC|CUC)-/i, '') === numeroOrden,
        )
        .map((orden: { id: string }) => orden.id);
      const otrasOrdenes = ordenes.filter((orden: { id: string; numero_orden: string }) =>
        !idsOrden.includes(orden.id) && !orden.numero_orden.startsWith('T-'),
      );
      if (servicio.numero_orden.startsWith('T-') && !otrasOrdenes.length) {
        throw new BadRequestException('La cuenta debe conservar al menos una orden de servicio.');
      }
      if (!servicio.numero_orden.startsWith('T-') && !otrasOrdenes.length) {
        throw new BadRequestException('La cuenta debe conservar al menos una orden de servicio.');
      }
      await this.prisma.servicios.deleteMany({
        where: { id: { in: idsOrden }, cuenta_cobro_id: servicio.cuenta_cobro_id },
      });
      return { deleted: true, cuentaEliminada: false };
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
    const isCorrection = this.isCorrectionAccount(servicio.cuentas_cobro);
    const isEditableState = ['Rechazado', 'Observado'].includes(servicio.estado as string);

    if (isRadicada && !isEditableState && !isCorrection) {
      throw new BadRequestException('Solo puedes editar servicios rechazados u observados una vez radicada la cuenta.');
    }

    // Si es un borrador (no radicada), verificamos la ventana de carga.
    if (!isRadicada) {
      await this.assertVentanaAbierta(usuarioId);
    }

    let numeroOrdenActualizado: string | undefined;
    if (dto.numero_orden !== undefined) {
      const digits = dto.numero_orden.replace(/^(T-)?(BUC|CUC)-/i, '').trim();
      const prefix = servicio.numero_orden.match(/^(T-)?(BUC|CUC)-/i)?.[0] ?? '';
      numeroOrdenActualizado = `${prefix}${digits}`;
      const duplicate = await this.prisma.servicios.findFirst({
        where: {
          cuenta_cobro_id: servicio.cuenta_cobro_id,
          numero_orden: numeroOrdenActualizado,
          id: { not: servicioId },
        },
      });
      if (duplicate) {
        throw new BadRequestException(`La orden ${digits} ya está registrada en esta cuenta.`);
      }
    }

    const esTraslado = servicio.numero_orden.startsWith('T-');
    let tipo = null;
    if (dto.tipo_servicio_id !== undefined) {
      tipo = await this.prisma.tipos_servicio.findUnique({
        where: { id: dto.tipo_servicio_id },
      });
      if (!tipo || !tipo.activo) {
        throw new BadRequestException('El tipo de servicio no existe o está inactivo.');
      }
    }

    let descripcion: string | null | undefined = dto.descripcion_especifica;
    let fotos = dto.fotos;
    let valorCobrado: number | undefined;
    if (esTraslado && (tipo || dto.destino !== undefined || dto.transporte !== undefined)) {
      const tipoTraslado = tipo ?? await this.prisma.tipos_servicio.findUnique({
        where: { id: servicio.tipo_servicio_id },
      });
      if (!tipoTraslado || !tipoTraslado.activo) {
        throw new BadRequestException('El tipo de traslado no existe o está inactivo.');
      }
      if (!dto.destino || !dto.transporte) {
        throw new BadRequestException('Selecciona el destino y el medio de transporte del traslado.');
      }
      const otrosServicios = await this.prisma.servicios.findMany({
        where: {
          cuenta_cobro_id: servicio.cuenta_cobro_id,
          id: { not: servicioId },
        },
        select: { id: true, valor_cobrado: true, tipo_servicio_id: true },
      });
      const { calculatedValue } = await this.calculateTransfer(
        usuarioId,
        {
          tipo_servicio_id: tipoTraslado.id,
          numero_orden: dto.numero_orden ?? servicio.numero_orden,
          destino: dto.destino,
          transporte: dto.transporte,
          descripcion_especifica: dto.descripcion_especifica,
        },
        otrosServicios.map((item: { id: string; valor_cobrado: unknown; tipo_servicio_id: string }) => ({
          id: item.id,
          valor_cobrado: Number(item.valor_cobrado),
          tipo_servicio_id: item.tipo_servicio_id,
        })),
      );
      valorCobrado = calculatedValue;
    } else if (!esTraslado && (tipo || dto.puertas_nevecon_antiguo !== undefined || dto.puertas_nevecon_nuevo !== undefined || dto.requiere_ayudante !== undefined || dto.fotos !== undefined)) {
      const tipoServicio = tipo ?? await this.prisma.tipos_servicio.findUnique({
        where: { id: servicio.tipo_servicio_id },
      });
      if (!tipoServicio || !tipoServicio.activo) {
        throw new BadRequestException('El tipo de servicio no existe o está inactivo.');
      }
      const nombreNormalizado = tipoServicio.nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      const esRecoleccion = /recoleccion|recogida/.test(nombreNormalizado);
      const incluyeAyudante = esRecoleccion && nombreNormalizado.includes('incluye ayudante');
      const esNeveconManoAMano = esRecoleccion && nombreNormalizado.includes('nevecon') &&
        nombreNormalizado.includes('mano a mano');
      const puertasAntiguo = esNeveconManoAMano ? (dto.puertas_nevecon_antiguo ?? 0) : 0;
      const puertasNuevo = esNeveconManoAMano ? (dto.puertas_nevecon_nuevo ?? 0) : 0;
      const puertasDesmontadas = puertasAntiguo + puertasNuevo;
      const requiereAyudante = esRecoleccion && !incluyeAyudante && (dto.requiere_ayudante ?? false);
      fotos = dto.fotos ?? servicio.fotos;
      if (
        fotos.length > 10 ||
        fotos.some((foto: string) =>
          !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(foto) ||
          foto.length > 1_400_000,
        )
      ) {
        throw new BadRequestException('Las fotos deben ser imágenes JPG, PNG o WebP de máximo 1 MB cada una (hasta 10).');
      }
      if (puertasDesmontadas > 0 && fotos.length === 0) {
        throw new BadRequestException('Agrega al menos una foto de las puertas desmontadas.');
      }
      if (requiereAyudante && fotos.length === 0) {
        throw new BadRequestException('Agrega al menos una foto del motivo por el que necesitaste ayudante.');
      }
      if (requiereAyudante && !dto.motivo_ayudante?.trim() &&
          !/Ayudante: sí \(motivo: .+?, fotos del motivo: \d+\)/.test(servicio.descripcion_especifica ?? '')) {
        throw new BadRequestException('Describe por qué necesitaste ayudante.');
      }
      const descripcionBase = (dto.descripcion_especifica ?? servicio.descripcion_especifica ?? '')
        .replace(/\s*\|\s*Recolección:.*$/i, '')
        .trim();
      const detalles: string[] = [];
      if (puertasDesmontadas > 0) {
        detalles.push(`Puertas desmontadas: nevecon antiguo ${puertasAntiguo}, nevecon nuevo ${puertasNuevo} (fotos: ${fotos.length})`);
      }
      if (requiereAyudante) {
        const motivo = dto.motivo_ayudante?.trim() ??
          servicio.descripcion_especifica?.match(/Ayudante: sí \(motivo: (.+?), fotos del motivo:/)?.[1];
        if (!motivo) throw new BadRequestException('Describe por qué necesitaste ayudante.');
        detalles.push(`Ayudante: sí (motivo: ${motivo}, fotos del motivo: ${fotos.length})`);
      }
      descripcion = [
        descripcionBase,
        detalles.length ? `Recolección: ${detalles.join(', ')}` : null,
      ].filter(Boolean).join(' | ') || null;
      const valorBase = tipoServicio.requiere_valor_admin
        ? (tipoServicio.id === servicio.tipo_servicio_id ? Number(servicio.valor_cobrado) : 0)
        : Number(tipoServicio.valor_estandar);
      valorCobrado = valorBase + puertasDesmontadas * 10_000 + (requiereAyudante ? 10_000 : 0);
    }

    if (esTraslado && fotos !== undefined && (
      fotos.length > 10 ||
      fotos.some((foto) =>
        !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(foto) ||
        foto.length > 1_400_000,
      )
    )) {
      throw new BadRequestException('Las fotos deben ser imágenes JPG, PNG o WebP de máximo 1 MB cada una (hasta 10).');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        !esTraslado &&
        numeroOrdenActualizado !== undefined &&
        numeroOrdenActualizado.replace(/^(T-)?(BUC|CUC)-/i, '') !==
          servicio.numero_orden.replace(/^(T-)?(BUC|CUC)-/i, '')
      ) {
        await registerOrderNumber(
          tx,
          numeroOrdenActualizado.replace(/^(T-)?(BUC|CUC)-/i, ''),
        );
      }
      return tx.servicios.update({
        where: { id: servicioId },
        data: {
          tipo_servicio_id: dto.tipo_servicio_id,
          numero_orden: numeroOrdenActualizado,
          descripcion_especifica: descripcion,
          ...(fotos !== undefined ? { fotos } : {}),
          ...(valorCobrado !== undefined ? { valor_cobrado: valorCobrado } : {}),
          updated_at: new Date(),
          // Al editar un servicio rechazado/observado, vuelve a 'Pendiente' para que el admin lo revise de nuevo.
          estado: isCorrection ? servicio.estado : isEditableState ? 'Pendiente' : servicio.estado,
        },
        include: { tipos_servicio: true },
      });
    });

    if (isCorrection) return this.serializeServicio(updated);

    const estados = await this.prisma.servicios.findMany({
      where: { cuenta_cobro_id: updated.cuenta_cobro_id },
      select: { estado: true },
    });
    const estadosUnicos = new Set(estados.map((item) => item.estado));
    if (estadosUnicos.size === 1) {
      const estado = [...estadosUnicos][0];
      if (estado !== null) {
        await this.prisma.cuentas_cobro.update({
          where: { id: updated.cuenta_cobro_id },
          data: {
            estado,
            fecha_aprobacion: estado === 'Aprobado' ? new Date() : null,
          },
        });
      }
    }

    return this.serializeServicio(updated);
  }

  async submitAccountCorrection(usuarioId: string, cuentaId: string) {
    const cuenta = await this.prisma.cuentas_cobro.findFirst({
      where: { id: cuentaId, usuario_id: usuarioId },
      include: { servicios: true },
    });
    if (!cuenta) throw new NotFoundException('Cuenta de cobro no encontrada.');
    if (!this.isCorrectionAccount(cuenta)) {
      throw new BadRequestException('La cuenta no está habilitada para correcciones.');
    }
    if (cuenta.servicios.length === 0) {
      throw new BadRequestException('Agrega al menos una orden antes de enviar la cuenta a revisión.');
    }

    await this.prisma.$transaction(async (tx: any) => {
      await tx.servicios.updateMany({
        where: { cuenta_cobro_id: cuentaId },
        data: { estado: 'Pendiente', updated_at: new Date() },
      });
      await tx.cuentas_cobro.update({
        where: { id: cuentaId },
        data: {
          estado: 'Pendiente',
          fecha_aprobacion: null,
          firma_tecnico: null,
          fecha_firma: null,
        },
      });
    });

    return { id: cuentaId, estado: 'Pendiente', radicada: true };
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

    const periodo = getPeriodoConExcepcion(hoy, !!excepcion);
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
          include: {
            tipos_servicio: true,
            auditoria_servicios: {
              where: { estado_nuevo: { in: ['Observado', 'Rechazado'] } },
              orderBy: { fecha_accion: 'desc' },
              take: 1,
            },
          },
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
    const periodo = await this.getPeriodoVigente(usuarioId);
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

  async signAccount(usuarioId: string, cuentaId: string, firma: string) {
    const encodedImage = firma.slice('data:image/png;base64,'.length);
    const imageBytes = Buffer.from(encodedImage, 'base64');
    const isPng = imageBytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    if (!isPng || imageBytes.length === 0) {
      throw new BadRequestException('La firma debe ser una imagen PNG válida.');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const cuenta = await tx.cuentas_cobro.findFirst({
        where: { id: cuentaId, usuario_id: usuarioId },
        include: { servicios: { select: { estado: true } } },
      });
      if (!cuenta) {
        throw new NotFoundException('Cuenta de cobro no encontrada.');
      }
      if (!cuenta.radicada || cuenta.estado !== 'Aprobado') {
        throw new BadRequestException('Solo puedes firmar una cuenta radicada y aprobada.');
      }
      if (!cuenta.servicios.length || cuenta.servicios.some((servicio: { estado: string }) => servicio.estado !== 'Aprobado')) {
        throw new BadRequestException('Todos los servicios de la cuenta deben estar aprobados antes de firmarla.');
      }
      if (cuenta.firma_tecnico) {
        throw new ConflictException('Esta cuenta ya fue firmada.');
      }

      const fechaFirma = new Date();
      const result = await tx.cuentas_cobro.updateMany({
        where: {
          id: cuentaId,
          usuario_id: usuarioId,
          radicada: true,
          estado: 'Aprobado',
          firma_tecnico: null,
        },
        data: { firma_tecnico: firma, fecha_firma: fechaFirma },
      });
      if (result.count !== 1) {
        throw new ConflictException('La cuenta cambió mientras se guardaba la firma. Actualiza e inténtalo de nuevo.');
      }

      return { id: cuentaId, firma_tecnico: firma, fecha_firma: fechaFirma };
    });
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
      requiere_valor_admin: t.requiere_valor_admin,
    }));
  }


  // ---- Datos de cobro del técnico (encriptados) ----

  async getDatosCobro(usuarioId: string) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: { datos_cobro_encrypted: true },
    });
    if (!user || !user.datos_cobro_encrypted) return null;
    return decryptDatosCobro(user.datos_cobro_encrypted);
  }

  async saveDatosCobro(usuarioId: string, datos: DatosCobro) {
    const encrypted = encryptDatosCobro(datos);
    await this.prisma.usuarios.update({
      where: { id: usuarioId },
      data: { datos_cobro_encrypted: encrypted },
    });
    return datos;
  }

  async getMyAccounts(usuarioId: string) {
    const cuentas = await this.prisma.cuentas_cobro.findMany({
      where: { usuario_id: usuarioId, radicada: true },
      include: {
        servicios: {
          include: {
            tipos_servicio: true,
            auditoria_servicios: {
              where: { estado_nuevo: { in: ['Observado', 'Rechazado'] } },
              orderBy: { fecha_accion: 'desc' },
              take: 1,
            },
          },
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    return cuentas.map((c: any) => this.serializeCuenta(c));
  }
}
