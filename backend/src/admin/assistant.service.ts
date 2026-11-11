import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AssistantChatDto } from './dto/assistant-chat.dto';

const MAX_ACCOUNTS_PER_PERIOD = 2000;
const REPORT_SCHEMA = {
  name: 'account_report_request',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: { type: 'string', enum: ['report', 'clarification'] },
      clarification: { type: ['string', 'null'] },
      title: { type: 'string' },
      group_by: {
        type: 'string',
        enum: ['none', 'month', 'site', 'technician', 'service', 'status'],
      },
      year: { type: ['integer', 'null'] },
      month: { type: ['integer', 'null'] },
      compare: { type: 'string', enum: ['none', 'previous_month', 'previous_year'] },
      status: {
        type: ['string', 'null'],
        enum: ['Pendiente', 'Aprobado', 'Observado', 'Rechazado', null],
      },
      site: { type: ['string', 'null'], enum: ['Bucaramanga', 'Cucuta', null] },
      technician: { type: ['string', 'null'] },
    },
    required: [
      'action',
      'clarification',
      'title',
      'group_by',
      'year',
      'month',
      'compare',
      'status',
      'site',
      'technician',
    ],
  },
} as const;

type ReportQuery = {
  group_by: 'none' | 'month' | 'site' | 'technician' | 'service' | 'status';
  year: number | null;
  month: number | null;
  compare: 'none' | 'previous_month' | 'previous_year';
  status: 'Pendiente' | 'Aprobado' | 'Observado' | 'Rechazado' | null;
  site: 'Bucaramanga' | 'Cucuta' | null;
  technician: string | null;
};

type ReportAccount = {
  id: string;
  mes: number;
  anio: number;
  estado: string | null;
  fecha_creacion: Date | null;
  fecha_aprobacion: Date | null;
  usuarios: { nombre_completo: string | null; sede: string | null };
  servicios: {
    numero_orden: string;
    tipo_servicio_id: string;
    valor_cobrado: unknown;
    tipos_servicio: { nombre: string } | null;
  }[];
};

type ReportMetric = {
  cuentas: number;
  servicios: number;
  total_cobrado: number;
  aprobadas: number;
  devueltas: number;
  pendientes: number;
  promedio_aprobacion_dias: number | null;
};

type ReportRow = ReportMetric & { label: string };

type ReportPeriod = { year: number | null; month: number | null };

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(private readonly prisma: PrismaService) {}

  async chat(dto: AssistantChatDto) {
    const request = await this.parseRequest(dto.message.trim(), dto.previousQuery);
    if (request.action === 'clarification') {
      return {
        kind: 'clarification' as const,
        message: request.clarification ?? '¿Qué período y dato quieres consultar?',
        suggestedQuestions: [],
      };
    }

    const query = this.validateQuery(request, dto.message);
    if (query.compare === 'previous_month' && (query.month === null || query.year === null)) {
      return {
        kind: 'clarification' as const,
        message: 'Para comparar con el mes anterior, dime qué mes y año quieres revisar.',
        suggestedQuestions: [],
      };
    }
    if (query.compare === 'previous_year' && query.year === null) {
      return {
        kind: 'clarification' as const,
        message: 'Para comparar con el año anterior, dime qué año quieres revisar.',
        suggestedQuestions: [],
      };
    }

    const currentPeriod = { year: query.year, month: query.month };
    const previousPeriod = this.getComparisonPeriod(currentPeriod, query.compare);
    const [current, previous] = await Promise.all([
      this.loadPeriod(query, currentPeriod),
      previousPeriod ? this.loadPeriod(query, previousPeriod) : Promise.resolve(null),
    ]);
    const summary = this.aggregate(current.accounts);
    const grouped = this.groupAccounts(current.accounts, query.group_by);
    const previousSummary = previous ? this.aggregate(previous.accounts) : null;

    return {
      kind: 'report' as const,
      title: this.cleanTitle(request.title),
      message: this.createAnswer(summary, current.limited, previousSummary),
      query,
      summary,
      rows: grouped.rows,
      groupsLimited: grouped.limited,
      previous: previousSummary
        ? {
            label: this.periodLabel(previousPeriod!),
            summary: previousSummary,
            limited: previous!.limited,
          }
        : null,
      periodLabel: this.periodLabel(currentPeriod),
      limited: current.limited,
      suggestedQuestions: this.suggestQuestions(query, summary),
      sourceCount: current.accounts.length,
      sourcesLimited: current.accounts.length > 100,
      sources: current.accounts.slice(0, 100).map((account) => ({
        id: account.id,
        technician: account.usuarios.nombre_completo ?? 'Técnico',
        site: account.usuarios.sede ?? 'Sin sede',
        period: `${account.mes}/${account.anio}`,
        status: account.estado ?? 'Sin estado',
        total: account.servicios.reduce((total, service) => total + Number(service.valor_cobrado), 0),
      })),
    };
  }

  async transcribe(file: { buffer: Buffer; mimetype: string } | undefined) {
    if (!file) throw new BadRequestException('Graba un audio antes de enviarlo.');
    if (!file.mimetype.startsWith('audio/')) {
      throw new BadRequestException('El archivo debe ser un audio válido.');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('Falta configurar OPENAI_API_KEY en el backend.');
    }

    const form = new FormData();
    const filename = file.mimetype.includes('mp4') ? 'consulta.m4a' : 'consulta.webm';
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      filename,
    );
    form.append('model', process.env.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe');
    form.append('language', 'es');
    form.append('response_format', 'json');

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      this.logger.warn('OpenAI transcription request could not be completed.');
      throw new BadGatewayException('No se pudo conectar con OpenAI para transcribir el audio.');
    }
    if (!response.ok) {
      this.logger.warn(`OpenAI transcription request failed with status ${response.status}.`);
      throw new BadGatewayException('OpenAI no pudo transcribir el audio. Inténtalo de nuevo.');
    }
    const payload = (await response.json()) as { text?: string };
    const text = payload.text?.trim();
    if (!text) throw new BadGatewayException('No se detectó una consulta en el audio.');
    return { text };
  }

  private async parseRequest(message: string, previousQuery?: Record<string, unknown>) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('Falta configurar OPENAI_API_KEY en el backend.');
    }

    const safePreviousQuery = previousQuery
      ? this.selectPreviousQuery(previousQuery)
      : null;
    const now = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const requestBody = {
      model: process.env.OPENAI_REPORT_MODEL ?? 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 350,
      store: false,
      response_format: {
        type: 'json_schema',
        json_schema: REPORT_SCHEMA,
      },
      messages: [
        {
          role: 'system',
          content: [
            'Convierte la petición en una consulta de reporte para un sistema colombiano de cuentas de cobro.',
            'Solo puedes elegir agrupación none, month, site, technician, service o status; y estado Pendiente, Aprobado, Observado o Rechazado.',
            'Admite un mes/año, un año, o todo el histórico; comparaciones solo contra el mes o año anterior.',
            'Solo puedes reportar cuentas, servicios, valores cobrados, estados de cuenta y promedio de días entre radicación y aprobación.',
            'No inventes motivos de devolución, firmas u otros datos que no estén en esas métricas; para ellos, pide una aclaración indicando la limitación.',
            'La sede solo puede ser Bucaramanga o Cucuta. Si la petición no se puede resolver con esas dimensiones, pide una aclaración breve.',
            'Si la petición menciona un mes sin año, usa el año actual salvo que pida explícitamente todos los años o el histórico.',
            'Si la petición es un seguimiento como "solo Bucaramanga", conserva los filtros anteriores y cambia solo lo solicitado.',
            'No inventes filtros ni asumas que una comparación es entre períodos cuando no se pidió.',
            `La fecha actual en Colombia es ${now}. Escribe title corto en español y devuelve solo el JSON del esquema.`,
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({ message, previousQuery: safePreviousQuery }),
        },
      ],
    };
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      this.logger.warn('OpenAI report parser request could not be completed.');
      throw new BadGatewayException('No se pudo conectar con OpenAI para interpretar la consulta.');
    }
    if (!response.ok) {
      this.logger.warn(`OpenAI report parser failed with status ${response.status}.`);
      throw new BadGatewayException('OpenAI no pudo interpretar la consulta. Inténtalo de nuevo.');
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new BadGatewayException('OpenAI devolvió una respuesta vacía.');
    try {
      return JSON.parse(content) as {
        action: 'report' | 'clarification';
        clarification: string | null;
        title: string;
        group_by: ReportQuery['group_by'];
        year: number | null;
        month: number | null;
        compare: ReportQuery['compare'];
        status: ReportQuery['status'];
        site: ReportQuery['site'];
        technician: string | null;
      };
    } catch {
      throw new BadGatewayException('OpenAI devolvió un formato de consulta inválido.');
    }
  }

  private validateQuery(
    request: Awaited<ReturnType<AssistantService['parseRequest']>>,
    message: string,
  ): ReportQuery {
    const groupings: ReportQuery['group_by'][] = ['none', 'month', 'site', 'technician', 'service', 'status'];
    const comparisons: ReportQuery['compare'][] = ['none', 'previous_month', 'previous_year'];
    const statuses: NonNullable<ReportQuery['status']>[] = ['Pendiente', 'Aprobado', 'Observado', 'Rechazado'];
    const sites: NonNullable<ReportQuery['site']>[] = ['Bucaramanga', 'Cucuta'];
    if (!groupings.includes(request.group_by) || !comparisons.includes(request.compare)) {
      throw new BadGatewayException('OpenAI devolvió filtros de reporte no permitidos.');
    }
    if (request.status !== null && !statuses.includes(request.status)) {
      throw new BadGatewayException('OpenAI devolvió un estado de cuenta no permitido.');
    }
    if (request.site !== null && !sites.includes(request.site)) {
      throw new BadGatewayException('OpenAI devolvió una sede no permitida.');
    }
    if (
      (request.year !== null && (!Number.isInteger(request.year) || request.year < 2000 || request.year > 2100)) ||
      (request.month !== null && (!Number.isInteger(request.month) || request.month < 1 || request.month > 12))
    ) {
      throw new BadGatewayException('OpenAI devolvió un período de reporte inválido.');
    }
    const asksAllYears = /\btodos los años\b|hist[oó]ric[oa]|desde el inicio/i.test(message);
    const currentYearInColombia = Number(
      new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Bogota' }).format(new Date()),
    );
    return {
      group_by: request.group_by,
      year: request.year ?? (request.month !== null && !asksAllYears ? currentYearInColombia : null),
      month: request.month,
      compare: request.compare,
      status: request.status,
      site: request.site,
      technician: request.technician?.trim().slice(0, 100) || null,
    };
  }

  private selectPreviousQuery(previous: Record<string, unknown>) {
    const allowed = ['none', 'month', 'site', 'technician', 'service', 'status'];
    const comparisons = ['none', 'previous_month', 'previous_year'];
    const statuses = ['Pendiente', 'Aprobado', 'Observado', 'Rechazado', null];
    const sites = ['Bucaramanga', 'Cucuta', null];
    return {
      group_by: allowed.includes(String(previous.group_by)) ? previous.group_by : 'none',
      year: Number.isInteger(previous.year) ? previous.year : null,
      month: Number.isInteger(previous.month) ? previous.month : null,
      compare: comparisons.includes(String(previous.compare)) ? previous.compare : 'none',
      status: statuses.includes(previous.status as string | null) ? previous.status : null,
      site: sites.includes(previous.site as string | null) ? previous.site : null,
      technician: typeof previous.technician === 'string' ? previous.technician.slice(0, 100) : null,
    };
  }

  private async loadPeriod(query: ReportQuery, period: ReportPeriod) {
    const usersFilter = {
      ...(query.site
        ? { sede: { contains: query.site === 'Cucuta' ? 'Cuc' : 'Buca', mode: 'insensitive' as const } }
        : {}),
      ...(query.technician
        ? { nombre_completo: { contains: query.technician, mode: 'insensitive' as const } }
        : {}),
    };
    const accounts = await this.prisma.cuentas_cobro.findMany({
      where: {
        radicada: true,
        ...(period.year ? { anio: period.year } : {}),
        ...(period.month ? { mes: period.month } : {}),
        ...(query.status ? { estado: query.status } : {}),
        ...(Object.keys(usersFilter).length ? { usuarios: usersFilter } : {}),
      },
      include: {
        usuarios: { select: { nombre_completo: true, sede: true } },
        servicios: {
          include: { tipos_servicio: { select: { nombre: true } } },
        },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { fecha_creacion: 'desc' }],
      take: MAX_ACCOUNTS_PER_PERIOD + 1,
    }) as unknown as ReportAccount[];
    return {
      accounts: accounts.slice(0, MAX_ACCOUNTS_PER_PERIOD),
      limited: accounts.length > MAX_ACCOUNTS_PER_PERIOD,
    };
  }

  private aggregate(accounts: ReportAccount[]): ReportMetric {
    const services = accounts.flatMap((account) => account.servicios);
    const approvalDurations = accounts
      .filter((account) => account.fecha_creacion && account.fecha_aprobacion)
      .map((account) =>
        (account.fecha_aprobacion!.getTime() - account.fecha_creacion!.getTime()) / 86_400_000,
      );
    return {
      cuentas: accounts.length,
      servicios: services.filter((service) => !service.numero_orden.startsWith('T-')).length,
      total_cobrado: services.reduce((total, service) => total + Number(service.valor_cobrado), 0),
      aprobadas: accounts.filter((account) => account.estado === 'Aprobado').length,
      devueltas: accounts.filter((account) => ['Observado', 'Rechazado'].includes(account.estado ?? '')).length,
      pendientes: accounts.filter((account) => account.estado === 'Pendiente').length,
      promedio_aprobacion_dias: approvalDurations.length
        ? Number((approvalDurations.reduce((total, days) => total + days, 0) / approvalDurations.length).toFixed(1))
        : null,
    };
  }

  private groupAccounts(accounts: ReportAccount[], groupBy: ReportQuery['group_by']) {
    type Bucket = { accounts: Map<string, ReportAccount>; services: ReportAccount['servicios'][] };
    const buckets = new Map<string, Bucket>();
    const add = (label: string, account: ReportAccount, services: ReportAccount['servicios']) => {
      const bucket: Bucket = buckets.get(label) ?? {
        accounts: new Map<string, ReportAccount>(),
        services: [],
      };
      bucket.accounts.set(account.id, account);
      bucket.services.push(services);
      buckets.set(label, bucket);
    };

    for (const account of accounts) {
      if (groupBy === 'service') {
        const transfers = account.servicios.filter((service) => service.numero_orden.startsWith('T-'));
        const matchedTransfers = new Set<typeof transfers[number]>();
        for (const item of account.servicios.filter((service) => !service.numero_orden.startsWith('T-'))) {
          const order = item.numero_orden.toUpperCase();
          const matchingTransfers = transfers.filter(
            (transfer) => transfer.numero_orden.replace(/^T-/i, '').toUpperCase() === order,
          );
          matchingTransfers.forEach((transfer) => matchedTransfers.add(transfer));
          add(item.tipos_servicio?.nombre || 'Sin tipo', account, [item, ...matchingTransfers]);
        }
        for (const transfer of transfers) {
          if (!matchedTransfers.has(transfer)) add('Traslados sin orden asociada', account, [transfer]);
        }
        continue;
      }

      const label = groupBy === 'site'
        ? account.usuarios.sede ?? 'Sin sede'
        : groupBy === 'technician'
          ? account.usuarios.nombre_completo ?? 'Sin nombre'
          : groupBy === 'status'
            ? account.estado ?? 'Sin estado'
            : groupBy === 'month'
              ? `${String(account.mes).padStart(2, '0')}/${account.anio}`
              : 'Total general';
      add(label, account, account.servicios);
    }

    const rows = [...buckets.entries()].map(([label, bucket]) => {
      const groupedAccounts = [...bucket.accounts.values()];
      const metric = this.aggregate(groupedAccounts);
      const serviceCount = bucket.services.flat().filter(
        (service) => !service.numero_orden.startsWith('T-'),
      ).length;
      const charged = bucket.services.flat().reduce(
        (total, service) => total + Number(service.valor_cobrado),
        0,
      );
      return {
        ...metric,
        servicios: serviceCount,
        total_cobrado: charged,
        label,
      };
    });
    if (groupBy === 'month') {
      rows.sort((a, b) => {
        const [monthA, yearA] = a.label.split('/').map(Number);
        const [monthB, yearB] = b.label.split('/').map(Number);
        return yearB - yearA || monthB - monthA;
      });
    } else {
      rows.sort((a, b) => b.total_cobrado - a.total_cobrado);
    }
    return { rows: rows.slice(0, 100), limited: rows.length > 100 };
  }

  private getComparisonPeriod(
    period: ReportPeriod,
    comparison: ReportQuery['compare'],
  ): ReportPeriod | null {
    if (comparison === 'previous_month' && period.month && period.year) {
      const date = new Date(Date.UTC(period.year, period.month - 2, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
    }
    if (comparison === 'previous_year' && period.year) {
      return { year: period.year - 1, month: period.month };
    }
    return null;
  }

  private periodLabel(period: ReportPeriod) {
    const monthName = period.month
      ? new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' })
          .format(new Date(Date.UTC(2026, period.month - 1, 1)))
      : null;
    if (period.month && period.year) {
      return `${monthName![0].toLocaleUpperCase('es-CO')}${monthName!.slice(1)} ${period.year}`;
    }
    if (period.month) return `Todos los años · ${monthName}`;
    if (period.year) return `Año ${period.year}`;
    return 'Todo el histórico';
  }

  private createAnswer(current: ReportMetric, limited: boolean, previous: ReportMetric | null) {
    const answer =
      `Encontré ${current.cuentas} cuenta(s) radicada(s), ${current.servicios} servicio(s) y ` +
      `${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(current.total_cobrado)} cobrados. ` +
      `${current.aprobadas} aprobadas, ${current.devueltas} devueltas y ${current.pendientes} pendientes.`;
    const comparison = previous
      ? ` En el período anterior fueron ${previous.cuentas} cuentas y ` +
        `${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(previous.total_cobrado)} cobrados.`
      : '';
    return `${answer}${comparison}${limited ? ' El resultado está limitado a las 2000 cuentas más recientes por período.' : ''}`;
  }

  private suggestQuestions(query: ReportQuery, summary: ReportMetric) {
    const suggestions = new Set<string>();
    if (query.compare === 'none' && query.month && query.year) {
      suggestions.add('Compáralo con el mes anterior');
    }
    if (query.group_by !== 'site') suggestions.add('Desglósalo por sede');
    if (query.group_by !== 'technician') suggestions.add('Desglósalo por técnico');
    if (summary.devueltas > 0 && query.status !== 'Observado' && query.status !== 'Rechazado') {
      suggestions.add('Muéstrame solo las cuentas devueltas');
    }
    return [...suggestions].slice(0, 3);
  }

  private cleanTitle(title: string) {
    const cleaned = title?.trim().slice(0, 80);
    return cleaned || 'Reporte de cuentas de cobro';
  }
}
