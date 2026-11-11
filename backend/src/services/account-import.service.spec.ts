import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountImportService } from './account-import.service';

const serviceResult = {
  numero_orden: 'BUC-12345',
  tipo_servicio: 'Instalación',
  descripcion_especifica: 'Instalación de nevera',
  valor_cobrado: 48_000,
  es_traslado: false,
  destino: null,
  transporte: null,
  confianza: 'alta',
};

function openAiResponse(content: unknown) {
  return new Response(JSON.stringify({ output_text: JSON.stringify(content) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AccountImportService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('extracts PDF services, maps only known service types and disables OpenAI storage', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse({ services: [serviceResult] }));
    vi.stubGlobal('fetch', fetchMock);
    const prisma = {
      tipos_servicio: {
        findMany: vi.fn().mockResolvedValue([{ id: 'type-1', nombre: 'Instalación' }]),
      },
    } as never;
    const service = new AccountImportService(prisma);

    const result = await service.extractPdf({
      buffer: Buffer.from('%PDF-1.7 test document'),
      size: 23,
      mimetype: 'application/pdf',
    });

    expect(result.services[0]).toMatchObject({
      numero_orden: '12345',
      tipo_servicio_id: 'type-1',
      valor_cobrado: 48_000,
      confianza: 'alta',
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.store).toBe(false);
    expect(request.input[0].content[1].type).toBe('input_file');
    expect(request.input[0].content[1].file_data).toContain('data:application/pdf;base64,');
  });

  it('extracts one photo service, normalizes the order and rejects unknown file signatures', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse({ services: [serviceResult] }));
    vi.stubGlobal('fetch', fetchMock);
    const prisma = {
      tipos_servicio: {
        findMany: vi.fn().mockResolvedValue([{ id: 'type-1', nombre: 'Instalación' }]),
      },
    } as never;
    const service = new AccountImportService(prisma);

    const result = await service.extractPhoto({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      size: 4,
      mimetype: 'image/jpeg',
    });
    expect(result.numero_orden).toBe('12345');
    expect(result.tipo_servicio_id).toBe('type-1');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).input[0].content[1].type).toBe('input_image');

    await expect(service.extractPhoto({
      buffer: Buffer.from('not an image'),
      size: 12,
      mimetype: 'image/jpeg',
    })).rejects.toThrow('El contenido del archivo no coincide con su formato.');
  });
});
