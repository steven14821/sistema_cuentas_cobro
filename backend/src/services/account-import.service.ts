import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_PHOTO_BYTES = 1024 * 1024;
const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    services: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          numero_orden: { type: 'string' },
          tipo_servicio: { type: ['string', 'null'] },
          descripcion_especifica: { type: 'string' },
          valor_cobrado: { type: ['number', 'null'] },
          es_traslado: { type: 'boolean' },
          destino: { type: ['string', 'null'] },
          transporte: {
            type: ['string', 'null'],
            enum: ['MOTO_PROPIA', 'VEHICULO_EMPRESA', null],
          },
          confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
        },
        required: [
          'numero_orden',
          'tipo_servicio',
          'descripcion_especifica',
          'valor_cobrado',
          'es_traslado',
          'destino',
          'transporte',
          'confianza',
        ],
      },
    },
  },
  required: ['services'],
} as const;

export type ImportedServiceData = {
  numero_orden: string;
  tipo_servicio: string | null;
  tipo_servicio_id: string | null;
  descripcion_especifica: string;
  valor_cobrado: number | null;
  es_traslado: boolean;
  destino: string | null;
  transporte: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA' | null;
  confianza: 'alta' | 'media' | 'baja';
};

export type UploadedBinaryFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
};

type RawExtractedService = Omit<ImportedServiceData, 'tipo_servicio_id'>;

@Injectable()
export class AccountImportService {
  private readonly logger = new Logger(AccountImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async extractPhoto(file: UploadedBinaryFile): Promise<ImportedServiceData> {
    if (!file?.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Selecciona una foto JPG, PNG o WebP.');
    }
    this.validateFile(file, file.mimetype, MAX_PHOTO_BYTES);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new BadRequestException('La foto debe estar en formato JPG, PNG o WebP.');
    }

    const data = await this.extract({
      instructions:
        'Esta imagen corresponde a una evidencia de una cuenta de cobro. Extrae un solo servicio asociado a esta foto. ' +
        'No inventes datos: deja vacíos el número o la descripción si no se leen, y usa null para tipo, valor, destino o transporte desconocidos. ' +
        'El valor cobrado debe ser el escrito en la imagen; no calcules ni supongas tarifas. ' +
        'Marca es_traslado solo si la imagen muestra claramente un traslado. ' +
        'Asigna tipo_servicio únicamente usando un nombre exacto de la lista proporcionada; si no puedes identificarlo, usa null. ' +
        'Devuelve exactamente un servicio, incluso si hay campos por confirmar.',
      parts: [{
        type: 'input_image',
        image_url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        detail: 'high',
      }],
      maxOutputTokens: 1200,
    });

    const mapped = (await this.mapTypes(data)).services;
    if (mapped.length !== 1) {
      throw new BadGatewayException(
        'La foto no se pudo asociar a un solo servicio. Recorta una orden por foto o completa el servicio manualmente.',
      );
    }
    return mapped[0];
  }

  private validateFile(file: UploadedBinaryFile, mimetype: string, maxBytes: number) {
    if (!file?.buffer?.length || file.mimetype !== mimetype) {
      throw new BadRequestException('El archivo está vacío o su formato no es válido.');
    }
    if (
      (mimetype === 'image/jpeg' &&
        !(file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff)) ||
      (mimetype === 'image/png' && file.buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') ||
      (mimetype === 'image/webp' &&
        (file.buffer.toString('ascii', 0, 4) !== 'RIFF' ||
          file.buffer.toString('ascii', 8, 12) !== 'WEBP'))
    ) {
      throw new BadRequestException('El contenido del archivo no coincide con su formato.');
    }
    if (file.size > maxBytes) {
      throw new BadRequestException('La foto comprimida no puede superar 1 MB.');
    }
  }

  private async extract({
    instructions,
    parts,
    maxOutputTokens,
  }: {
    instructions: string;
    parts: Record<string, string>[];
    maxOutputTokens: number;
  }): Promise<{ services: RawExtractedService[] }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('Falta configurar OPENAI_API_KEY en el backend.');
    }

    const types = await this.prisma.tipos_servicio.findMany({
      where: { activo: true },
      select: { nombre: true },
      orderBy: { nombre: 'asc' },
    });
    const typeNames = types.map((type) => type.nombre);
    const requestBody = {
      model: process.env.OPENAI_IMPORT_MODEL ?? 'gpt-4o-mini',
      store: false,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: 'json_schema',
          name: 'account_service_extraction',
          strict: true,
          schema: EXTRACTION_SCHEMA,
        },
      },
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `${instructions}\nTipos activos disponibles: ${JSON.stringify(typeNames)}.`,
          },
          ...parts,
        ],
      }],
    };

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(90_000),
      });
    } catch {
      this.logger.warn('OpenAI account-document extraction request could not be completed.');
      throw new BadGatewayException('No se pudo conectar con OpenAI para leer el documento.');
    }

    if (!response.ok) {
      this.logger.warn(`OpenAI account-document extraction failed with status ${response.status}.`);
      throw new BadGatewayException('OpenAI no pudo leer el documento. Inténtalo de nuevo.');
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: { content?: { type: string; text?: string }[] }[];
    };
    const content = payload.output_text ??
      payload.output?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === 'output_text')?.text;
    if (!content) throw new BadGatewayException('OpenAI devolvió una respuesta vacía.');

    try {
      const parsed = JSON.parse(content) as { services?: RawExtractedService[] };
      if (!Array.isArray(parsed.services) || parsed.services.length > 80) {
        throw new Error('Invalid services array');
      }
      return {
        services: parsed.services.map((service) => this.validateExtractedService(service)),
      };
    } catch {
      throw new BadGatewayException('OpenAI devolvió datos de servicios con un formato inválido.');
    }
  }

  private validateExtractedService(value: RawExtractedService): RawExtractedService {
    if (
      typeof value.numero_orden !== 'string' ||
      typeof value.descripcion_especifica !== 'string' ||
      typeof value.es_traslado !== 'boolean' ||
      !['alta', 'media', 'baja'].includes(value.confianza) ||
      (value.valor_cobrado !== null &&
        (typeof value.valor_cobrado !== 'number' ||
          !Number.isFinite(value.valor_cobrado) ||
          value.valor_cobrado < 0))
    ) {
      throw new Error('Invalid extracted service');
    }
    return {
      numero_orden: value.numero_orden.replace(/^(T-)?(BUC|CUC)-/i, '').replace(/\D/g, '').slice(0, 5),
      tipo_servicio: typeof value.tipo_servicio === 'string' ? value.tipo_servicio.trim() : null,
      descripcion_especifica: value.descripcion_especifica.slice(0, 2000).trim(),
      valor_cobrado: value.valor_cobrado,
      es_traslado: value.es_traslado,
      destino: typeof value.destino === 'string' ? value.destino.slice(0, 100).trim() : null,
      transporte: value.transporte === 'MOTO_PROPIA' || value.transporte === 'VEHICULO_EMPRESA'
        ? value.transporte
        : null,
      confianza: value.confianza,
    };
  }

  private async mapTypes(data: { services: RawExtractedService[] }) {
    const types = await this.prisma.tipos_servicio.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
    });
    const normalize = (value: string) =>
      value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return {
      services: data.services.map((service) => {
        const type = types.find((candidate) =>
          normalize(candidate.nombre) === normalize(service.tipo_servicio ?? ''),
        );
        return { ...service, tipo_servicio_id: type?.id ?? null };
      }),
    };
  }
}
