import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalEmailService, type ApprovalEmailResult } from './approval-email.service';
import { auditServiceTariff, summarizeTariffAudits } from './account-audit';
import { parseColombiaEndOfDay } from '../services/period.util';
import * as bcrypt from 'bcrypt';

export type EstadoServicio = 'Pendiente' | 'Aprobado' | 'Observado' | 'Rechazado';
type FiltroCuentas = {
  mes?: number;
  anio?: number;
  estado?: EstadoServicio;
  usuario_id?: string;
};

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private approvalEmail: ApprovalEmailService,
  ) {}

  // ---- Serialización ----

  private serializeServicio(servicio: any, includePhotos = false) {
    return {
      id: servicio.id,
      cuenta_cobro_id: servicio.cuenta_cobro_id,
      tipo_servicio_id: servicio.tipo_servicio_id,
      tipo_servicio_nombre: servicio.tipos_servicio?.nombre ?? null,
      numero_orden: servicio.numero_orden,
      descripcion_especifica: servicio.descripcion_especifica,
      ...(includePhotos ? { fotos: servicio.fotos ?? [] } : {}),
      valor_cobrado: Number(servicio.valor_cobrado),
      estado: servicio.estado,
      created_at: servicio.created_at,
      auditoria_tarifa: auditServiceTariff({
        numero_orden: servicio.numero_orden,
        descripcion_especifica: servicio.descripcion_especifica,
        valor_cobrado: Number(servicio.valor_cobrado),
        tipo_servicio_nombre: servicio.tipos_servicio?.nombre ?? null,
        valor_estandar: servicio.tipos_servicio
          ? Number(servicio.tipos_servicio.valor_estandar)
          : null,
        tipo_servicio_activo: servicio.tipos_servicio?.activo ?? null,
      }),
      auditoria: (servicio.auditoria_servicios ?? []).map((a: any) => ({
        id: a.id,
        estado_anterior: a.estado_anterior,
        estado_nuevo: a.estado_nuevo,
        observacion: a.observacion,
        fecha_accion: a.fecha_accion,
        admin: a.usuarios?.nombre_completo ?? null,
      })),
    };
  }

  private serializeCuenta(cuenta: any, includePhotos = false) {
    const servicios = (cuenta.servicios ?? []).map((s: any) =>
      this.serializeServicio(s, includePhotos),
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
      tecnico_email: cuenta.usuarios?.email ?? null,
      tecnico_sede: cuenta.usuarios?.sede ?? null,
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
      auditoria_tarifas: summarizeTariffAudits(
        servicios.map((s: { auditoria_tarifa: ReturnType<typeof auditServiceTariff> }) => s.auditoria_tarifa),
      ),
      servicios,
    };
  }

  // ---- Revisión de servicios ----

  // Solo servicios de cuentas YA radicadas por el técnico.
  async getPendingServices() {
    const servicios = await this.prisma.servicios.findMany({
      where: {
        estado: 'Pendiente',
        cuentas_cobro: { radicada: true },
      },
      include: {
        tipos_servicio: true,
        cuentas_cobro: {
          include: { usuarios: { select: { nombre_completo: true, email: true } } },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return servicios.map((s: any) => ({
      ...this.serializeServicio(s),
      tecnico: s.cuentas_cobro?.usuarios?.nombre_completo ?? null,
      mes: s.cuentas_cobro?.mes ?? null,
      anio: s.cuentas_cobro?.anio ?? null,
      cuenta_cobro_id: s.cuenta_cobro_id,
    }));
  }

  async updateServiceStatus(
    servicioId: string,
    status: EstadoServicio,
    adminId: string,
    observacion?: string,
  ) {
    const servicio = await this.prisma.servicios.findUnique({
      where: { id: servicioId },
      include: {
        cuentas_cobro: {
          include: { usuarios: { select: { nombre_completo: true, email: true } } },
        },
      },
    });

    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado');
    }

    await this.prisma.auditoria_servicios.create({
      data: {
        servicio_id: servicioId,
        usuario_admin_id: adminId,
        estado_anterior: servicio.estado as any,
        estado_nuevo: status,
        observacion: observacion ?? '',
        fecha_accion: new Date(),
      },
    });

    const updated = await this.prisma.servicios.update({
      where: { id: servicioId },
      data: { estado: status, updated_at: new Date() },
    });

    const cuentaAprobada = await this.recomputeCuentaEstado(updated.cuenta_cobro_id);
    const emailNotification = cuentaAprobada
      ? await this.sendApprovalEmail(servicio.cuentas_cobro)
      : undefined;

    return {
      ...this.serializeServicio(updated),
      ...(emailNotification ? { email_notification: emailNotification } : {}),
    };
  }

  async updateServiceType(servicioId: string, tipoServicioId: string, adminId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const servicio = await tx.servicios.findUnique({
        where: { id: servicioId },
        include: { cuentas_cobro: true, tipos_servicio: true },
      });
      if (!servicio) {
        throw new NotFoundException('Servicio no encontrado.');
      }
      if (!servicio.cuentas_cobro?.radicada) {
        throw new BadRequestException('Solo se puede cambiar el tipo de un servicio de una cuenta radicada.');
      }

      const nuevoTipo = await tx.tipos_servicio.findUnique({
        where: { id: tipoServicioId },
      });
      if (!nuevoTipo?.activo) {
        throw new BadRequestException('El tipo de servicio no existe o está inactivo.');
      }
      if (servicio.tipo_servicio_id === tipoServicioId) {
        return this.serializeServicio(servicio);
      }

      const valorAnterior = Number(servicio.valor_cobrado);
      const valorNuevo = Number(nuevoTipo.valor_estandar);
      const updated = await tx.servicios.update({
        where: { id: servicioId },
        data: {
          tipo_servicio_id: tipoServicioId,
          valor_cobrado: valorNuevo,
          updated_at: new Date(),
        },
        include: { tipos_servicio: true },
      });

      await tx.auditoria_servicios.create({
        data: {
          servicio_id: servicioId,
          usuario_admin_id: adminId,
          estado_anterior: servicio.estado,
          estado_nuevo: servicio.estado,
          observacion: `Tipo cambiado de "${servicio.tipos_servicio?.nombre ?? 'Sin tipo'}" a "${nuevoTipo.nombre}". Valor actualizado de ${valorAnterior} a ${valorNuevo}.`,
          fecha_accion: new Date(),
        },
      });
      await tx.cuentas_cobro.update({
        where: { id: servicio.cuenta_cobro_id },
        data: { firma_tecnico: null, fecha_firma: null },
      });

      return this.serializeServicio(updated);
    });
  }

  // Si todos los servicios de la cuenta comparten estado, se refleja en la cuenta.
  private async recomputeCuentaEstado(cuentaId: string): Promise<boolean> {
    const [cuenta, servicios] = await Promise.all([
      this.prisma.cuentas_cobro.findUnique({
        where: { id: cuentaId },
        select: { estado: true },
      }),
      this.prisma.servicios.findMany({
        where: { cuenta_cobro_id: cuentaId },
      }),
    ]);

    const estados = new Set(servicios.map((s: any) => s.estado));
    const estado = estados.size === 1 ? ([...estados][0] as EstadoServicio) : undefined;
    if (!estado) return false;

    await this.prisma.cuentas_cobro.update({
      where: { id: cuentaId },
      data: {
        firma_tecnico: null,
        fecha_firma: null,
        estado,
        fecha_aprobacion: estado === 'Aprobado' ? new Date() : null,
      },
    });
    return estado === 'Aprobado' && cuenta?.estado !== 'Aprobado';
  }

  private async sendApprovalEmail(account: {
    mes: number;
    anio: number;
    usuarios?: { nombre_completo?: string | null; email?: string | null } | null;
  }): Promise<ApprovalEmailResult> {
    if (!account.usuarios?.email) {
      this.logger.warn('Approval email not sent: technician has no email address.');
      return { status: 'failed' };
    }
    return this.approvalEmail.sendAccountApproved({
      email: account.usuarios.email,
      technician: account.usuarios.nombre_completo ?? 'Técnico',
      month: account.mes,
      year: account.anio,
    });
  }

  // ---- Revisión y aprobación por cuenta completa ----

  async getAccounts(filtro: FiltroCuentas = {}) {
    const cuentas = await this.prisma.cuentas_cobro.findMany({
      where: {
        radicada: true,
        ...(filtro.mes ? { mes: filtro.mes } : {}),
        ...(filtro.anio ? { anio: filtro.anio } : {}),
        ...(filtro.estado ? { estado: filtro.estado } : {}),
        ...(filtro.usuario_id ? { usuario_id: filtro.usuario_id } : {}),
      },
      include: {
        usuarios: { select: { nombre_completo: true, email: true, sede: true } },
        servicios: {
          include: { tipos_servicio: true },
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    return cuentas.map((c: any) => this.serializeCuenta(c));
  }

  async getAccountById(cuentaId: string) {
    const cuenta = await this.prisma.cuentas_cobro.findUnique({
      where: { id: cuentaId },
      include: {
        usuarios: { select: { nombre_completo: true, email: true, sede: true } },
        servicios: {
          include: {
            tipos_servicio: true,
            auditoria_servicios: {
              include: { usuarios: { select: { nombre_completo: true } } },
              orderBy: { fecha_accion: 'desc' },
            },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!cuenta) throw new NotFoundException('Cuenta de cobro no encontrada.');
    return this.serializeCuenta(cuenta, true);
  }

  // Aprobar/observar/rechazar la cuenta completa: cascadea a sus servicios.
  async updateAccountStatus(
    cuentaId: string,
    status: EstadoServicio,
    adminId: string,
    observacion?: string,
  ) {
    const cuenta = await this.prisma.cuentas_cobro.findUnique({
      where: { id: cuentaId },
      include: {
        servicios: true,
        usuarios: { select: { nombre_completo: true, email: true } },
      },
    });

    if (!cuenta) {
      throw new NotFoundException('Cuenta de cobro no encontrada.');
    }
    if (!cuenta.radicada) {
      throw new BadRequestException('La cuenta aún no ha sido radicada.');
    }

    await this.prisma.$transaction(async (tx: any) => {
      for (const servicio of cuenta.servicios) {
        await tx.auditoria_servicios.create({
          data: {
            servicio_id: servicio.id,
            usuario_admin_id: adminId,
            estado_anterior: servicio.estado as any,
            estado_nuevo: status,
            observacion: observacion ?? '',
            fecha_accion: new Date(),
          },
        });
        await tx.servicios.update({
          where: { id: servicio.id },
          data: { estado: status, updated_at: new Date() },
        });
      }

      await tx.cuentas_cobro.update({
        where: { id: cuentaId },
        data: {
          estado: status,
          fecha_aprobacion: status === 'Aprobado' ? new Date() : null,
          ...(status !== 'Aprobado' ? { firma_tecnico: null, fecha_firma: null } : {}),
        },
      });
    });

    const updatedAccount = await this.getAccountById(cuentaId);
    const emailNotification = status === 'Aprobado' && cuenta.estado !== 'Aprobado'
      ? await this.sendApprovalEmail({
          mes: cuenta.mes,
          anio: cuenta.anio,
          usuarios: cuenta.usuarios,
        })
      : undefined;
    return {
      ...updatedAccount,
      ...(emailNotification ? { email_notification: emailNotification } : {}),
    };
  }

  // ---- Resumen para el panel de control ----

  async getDashboardSummary() {
    const cuentas = await this.prisma.cuentas_cobro.findMany({
      where: { radicada: true },
      include: {
        usuarios: { select: { nombre_completo: true, email: true } },
        servicios: {
          include: { tipos_servicio: true },
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    const serializadas = cuentas.map((c: any) => this.serializeCuenta(c));

    const porEstado = {
      total: serializadas.length,
      pendientes: 0,
      aprobadas: 0,
      observadas: 0,
      rechazadas: 0,
    };
    let valorAprobado = 0;
    let valorRadicado = 0;
    let serviciosTotal = 0;
    let serviciosPendientes = 0;

    for (const c of serializadas) {
      valorRadicado += c.total;
      serviciosTotal += c.total_servicios;
      serviciosPendientes += c.servicios.filter((s: any) => s.estado === 'Pendiente').length;

      if (c.estado === 'Pendiente') porEstado.pendientes++;
      else if (c.estado === 'Aprobado') {
        porEstado.aprobadas++;
        valorAprobado += c.total;
      } else if (c.estado === 'Observado') porEstado.observadas++;
      else if (c.estado === 'Rechazado') porEstado.rechazadas++;
    }

    const tecnicos = await this.prisma.usuarios.findMany({
      where: { rol: 'Tecnico' },
      select: { activo: true },
    });

    return {
      cuentas: porEstado,
      valores: {
        radicado: valorRadicado,
        aprobado: valorAprobado,
        pendiente: valorRadicado - valorAprobado,
      },
      servicios: {
        total: serviciosTotal,
        pendientes: serviciosPendientes,
      },
      tecnicos: {
        total: tecnicos.length,
        activos: tecnicos.filter((t: any) => t.activo).length,
      },
      recientes: serializadas.slice(0, 5),
    };
  }

  // ---- Excepciones de carga ----

  async getExceptions() {
    const excepciones = await this.prisma.excepciones_carga.findMany({
      include: {
        usuarios_excepciones_carga_usuario_idTousuarios: {
          select: { nombre_completo: true, email: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return excepciones.map((e: any) => ({
      id: e.id,
      usuario_id: e.usuario_id,
      tecnico: e.usuarios_excepciones_carga_usuario_idTousuarios?.nombre_completo ?? null,
      fecha_vencimiento: e.fecha_vencimiento,
      motivo: e.motivo,
      created_at: e.created_at,
    }));
  }

  async createException(
    usuarioId: string,
    fechaVencimiento: Date,
    adminId: string,
    motivo?: string,
  ) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
    });
    if (!usuario) {
      throw new NotFoundException('El técnico indicado no existe.');
    }

    return this.prisma.excepciones_carga.create({
      data: {
        usuario_id: usuarioId,
        fecha_vencimiento: parseColombiaEndOfDay(fechaVencimiento),
        creado_por: adminId,
        motivo: motivo ?? '',
      },
    });
  }

  async deleteException(id: string) {
    const existing = await this.prisma.excepciones_carga.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Excepción no encontrada.');
    return this.prisma.excepciones_carga.delete({ where: { id } });
  }

  // ---- Gestión de usuarios ----

  async listUsers() {
    return this.prisma.usuarios.findMany({
      orderBy: { nombre_completo: 'asc' },
      select: {
        id: true,
        username: true,
        nombre_completo: true,
        email: true,
        rol: true,
        sede: true,
        activo: true,
        motivo_inactivacion: true,
        created_at: true,
      },
    });
  }

  async createUser(payload: {
    username: string;
    nombre_completo: string;
    email: string;
    password: string;
    generate_password?: boolean;
    rol: 'Tecnico' | 'Admin';
    sede?: string;
  }) {
    const existsByUsername = await this.prisma.usuarios.findUnique({
      where: { username: payload.username },
    });
    if (existsByUsername) {
      throw new ConflictException('Ya existe un usuario con ese nombre de usuario.');
    }

    const existsByEmail = await this.prisma.usuarios.findUnique({
      where: { email: payload.email },
    });
    if (existsByEmail) {
      throw new ConflictException('Ya existe un usuario con ese correo electrónico.');
    }

    const generatedPassword = payload.generate_password
      ? randomBytes(12).toString('base64url')
      : undefined;
    const password = generatedPassword ?? payload.password;
    if (!password || password.length < 4) {
      throw new BadRequestException('La contraseña debe tener al menos 4 caracteres.');
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const sedeNormalizada =
      payload.sede?.trim() || (payload.rol === 'Tecnico' ? 'Bucaramanga' : null);

    const user = await this.prisma.usuarios.create({
      data: {
        username: payload.username,
        password_hash: passwordHash,
        nombre_completo: payload.nombre_completo,
        email: payload.email,
        rol: payload.rol,
        sede: sedeNormalizada,
      },
      select: {
        id: true,
        username: true,
        nombre_completo: true,
        email: true,
        rol: true,
        sede: true,
        activo: true,
        created_at: true,
      },
    });
    return { user, ...(generatedPassword ? { generatedPassword } : {}) };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        nombre_completo: true,
        email: true,
        rol: true,
        sede: true,
        activo: true,
        motivo_inactivacion: true,
        created_at: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  async updateUser(
    userId: string,
    payload: { username?: string; nombre_completo?: string; email?: string; sede?: string | null },
  ) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const username = payload.username?.trim();
    const nombreCompleto = payload.nombre_completo?.trim();
    const email = payload.email?.trim();
    if (username !== undefined && !username) throw new BadRequestException('El nombre de usuario es obligatorio.');
    if (nombreCompleto !== undefined && !nombreCompleto) throw new BadRequestException('El nombre completo es obligatorio.');
    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Ingresa un correo electrónico válido.');
    }
    try {
      return await this.prisma.usuarios.update({
        where: { id: userId },
        data: {
          ...(username !== undefined ? { username } : {}),
          ...(nombreCompleto !== undefined ? { nombre_completo: nombreCompleto } : {}),
          ...(email !== undefined ? { email } : {}),
          ...(payload.sede !== undefined ? { sede: payload.sede?.trim() || null } : {}),
        },
        select: {
          id: true,
          username: true,
          nombre_completo: true,
          email: true,
          rol: true,
          sede: true,
          activo: true,
          motivo_inactivacion: true,
          created_at: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('El usuario o correo ya está en uso.');
      throw error;
    }
  }

  async resetUserPassword(userId: string) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const password = randomBytes(12).toString('base64url');
    await this.prisma.usuarios.update({
      where: { id: userId },
      data: { password_hash: await bcrypt.hash(password, 10) },
    });
    return { password };
  }

  async updateUserPassword(userId: string, password: string) {
    const user = await this.prisma.usuarios.findUnique({
      where: { id: userId },
      select: { id: true, rol: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.rol !== 'Tecnico') {
      throw new BadRequestException('Solo puedes cambiar la contraseña de un técnico.');
    }
    if (Buffer.byteLength(password, 'utf8') > 72) {
      throw new BadRequestException('La contraseña no puede superar 72 bytes.');
    }

    await this.prisma.usuarios.update({
      where: { id: userId },
      data: { password_hash: await bcrypt.hash(password, 10) },
    });
    return { success: true };
  }

  async updateUserRole(userId: string, rol: 'Tecnico' | 'Admin', currentAdminId?: string) {
    if (userId === currentAdminId) {
      throw new BadRequestException('No puedes cambiar tu propio rol.');
    }
    const user = await this.prisma.usuarios.findUnique({
      where: { id: userId },
      select: { id: true, rol: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return this.prisma.usuarios.update({
      where: { id: userId },
      data: { rol },
      select: {
        id: true,
        username: true,
        nombre_completo: true,
        email: true,
        rol: true,
        sede: true,
        activo: true,
        motivo_inactivacion: true,
        created_at: true,
      },
    });
  }

  async toggleUserActive(userId: string, reason?: string, currentAdminId?: string) {
    if (userId === currentAdminId) {
      throw new BadRequestException('No puedes desactivar tu propio usuario.');
    }
    const user = await this.prisma.usuarios.findUnique({
      where: { id: userId },
      select: { id: true, activo: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    if (user.activo && !reason?.trim()) {
      throw new BadRequestException('Indica el motivo para desactivar este usuario.');
    }

    return this.prisma.usuarios.update({
      where: { id: userId },
      data: {
        activo: !user.activo,
        ...(user.activo ? { motivo_inactivacion: reason!.trim() } : {}),
      },
      select: {
        id: true,
        username: true,
        nombre_completo: true,
        email: true,
        rol: true,
        sede: true,
        activo: true,
        motivo_inactivacion: true,
        created_at: true,
      },
    });
  }

  async deleteUser(userId: string, currentAdminId: string) {
    if (userId === currentAdminId) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta de usuario en sesión.');
    }

    const user = await this.prisma.usuarios.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    // Proteger registros de auditoría si el usuario es un Admin con histórico
    const auditCount = await this.prisma.auditoria_servicios.count({
      where: { usuario_admin_id: userId },
    });
    const excCreatedCount = await this.prisma.excepciones_carga.count({
      where: { creado_por: userId },
    });

    if (auditCount > 0 || excCreatedCount > 0) {
      throw new BadRequestException(
        'No es posible eliminar este administrador porque tiene registros históricos de auditoría contable. Desactiva la cuenta para revocar su acceso.',
      );
    }

    // Eliminación ordenada en transacción para cumplir la integridad referencial
    await this.prisma.$transaction(async (tx: any) => {
      // 1. Eliminar excepciones asociadas a este usuario
      await tx.excepciones_carga.deleteMany({
        where: { usuario_id: userId },
      });

      // 2. Eliminar cuentas, servicios y auditorías de servicios de este usuario
      const cuentas = await tx.cuentas_cobro.findMany({
        where: { usuario_id: userId },
        select: { id: true },
      });
      const cuentaIds = cuentas.map((c: any) => c.id);

      if (cuentaIds.length > 0) {
        const servicios = await tx.servicios.findMany({
          where: { cuenta_cobro_id: { in: cuentaIds } },
          select: { id: true },
        });
        const servicioIds = servicios.map((s: any) => s.id);

        if (servicioIds.length > 0) {
          await tx.auditoria_servicios.deleteMany({
            where: { servicio_id: { in: servicioIds } },
          });
          await tx.servicios.deleteMany({
            where: { id: { in: servicioIds } },
          });
        }

        await tx.cuentas_cobro.deleteMany({
          where: { id: { in: cuentaIds } },
        });
      }

      // 3. Eliminar usuario
      await tx.usuarios.delete({
        where: { id: userId },
      });
    });

    return { success: true, message: 'Usuario eliminado exitosamente.' };
  }
}
