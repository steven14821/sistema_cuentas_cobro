import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantService } from './assistant.service';

const reportRequest = {
  action: 'report',
  clarification: null,
  title: 'Cobros por sede',
  group_by: 'site',
  year: 2026,
  month: 10,
  compare: 'none',
  status: null,
  site: null,
  technician: null,
};

function openAiResponse(content: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'account-1',
    mes: 10,
    anio: 2026,
    estado: 'Aprobado',
    fecha_creacion: new Date('2026-10-01T10:00:00Z'),
    fecha_aprobacion: new Date('2026-10-03T10:00:00Z'),
    usuarios: { nombre_completo: 'Técnico de prueba', sede: 'Bucaramanga' },
    servicios: [
      {
        numero_orden: 'BUC-12345',
        tipo_servicio_id: 'type-1',
        valor_cobrado: 50_000,
        tipos_servicio: { nombre: 'Instalación' },
      },
      {
        numero_orden: 'T-BUC-12345',
        tipo_servicio_id: 'transfer-type',
        valor_cobrado: 5_000,
        tipos_servicio: { nombre: 'Traslado' },
      },
    ],
    ...overrides,
  };
}

describe('AssistantService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the model only to interpret a question and calculates the report from database records', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse(reportRequest));
    vi.stubGlobal('fetch', fetchMock);
    const account = makeAccount();
    const prisma = { cuentas_cobro: { findMany: vi.fn().mockResolvedValue([account]) } };
    const service = new AssistantService(prisma as any);

    const result = await service.chat({ message: 'Cuánto se cobró en octubre por sede' });

    expect(result.kind).toBe('report');
    if (result.kind !== 'report') throw new Error('Expected report response');
    expect(result.summary).toMatchObject({
      cuentas: 1,
      servicios: 1,
      total_cobrado: 55_000,
      aprobadas: 1,
      promedio_aprobacion_dias: 2,
    });
    expect(result.rows[0]).toMatchObject({ label: 'Bucaramanga', total_cobrado: 55_000 });
    expect(result.sources[0].technician).toBe('Técnico de prueba');

    const modelRequest = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(modelRequest.messages[1].content).toContain('Cuánto se cobró en octubre');
    expect(JSON.stringify(modelRequest)).not.toContain('Técnico de prueba');
    expect(JSON.stringify(modelRequest)).not.toContain('BUC-12345');
  });

  it('loads both exact periods for a previous-month comparison', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse({
      ...reportRequest,
      compare: 'previous_month',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const prisma = {
      cuentas_cobro: {
        findMany: vi.fn()
          .mockResolvedValueOnce([makeAccount()])
          .mockResolvedValueOnce([makeAccount({ id: 'previous-account', mes: 9 })]),
      },
    };
    const service = new AssistantService(prisma as any);

    const result = await service.chat({ message: 'Compara octubre con el mes anterior' });

    expect(prisma.cuentas_cobro.findMany).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe('report');
    if (result.kind !== 'report') throw new Error('Expected report response');
    expect(result.previous).toMatchObject({
      label: 'Septiembre 2026',
      summary: { cuentas: 1, total_cobrado: 55_000 },
    });
  });

  it('keeps transfer charges with the matching service when grouping by service type', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse({
      ...reportRequest,
      group_by: 'service',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const prisma = { cuentas_cobro: { findMany: vi.fn().mockResolvedValue([makeAccount()]) } };
    const service = new AssistantService(prisma as any);

    const result = await service.chat({ message: 'Desglosa por tipo de servicio' });

    expect(result.kind).toBe('report');
    if (result.kind !== 'report') throw new Error('Expected report response');
    expect(result.rows).toContainEqual(expect.objectContaining({
      label: 'Instalación',
      servicios: 1,
      total_cobrado: 55_000,
    }));
  });

  it('asks for a month before running an incomplete previous-month comparison', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(openAiResponse({
      ...reportRequest,
      month: null,
      compare: 'previous_month',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const prisma = { cuentas_cobro: { findMany: vi.fn() } };
    const service = new AssistantService(prisma as any);

    const result = await service.chat({ message: 'Compara con el mes anterior' });

    expect(result.kind).toBe('clarification');
    expect(prisma.cuentas_cobro.findMany).not.toHaveBeenCalled();
  });
});
