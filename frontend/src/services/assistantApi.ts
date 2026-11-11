import { apiFetch, apiUpload } from '../lib/api';

export type AssistantQuery = {
  group_by: 'none' | 'month' | 'site' | 'technician' | 'service' | 'status';
  year: number | null;
  month: number | null;
  compare: 'none' | 'previous_month' | 'previous_year';
  status: 'Pendiente' | 'Aprobado' | 'Observado' | 'Rechazado' | null;
  site: 'Bucaramanga' | 'Cucuta' | null;
  technician: string | null;
};

export type ReportMetric = {
  cuentas: number;
  servicios: number;
  total_cobrado: number;
  aprobadas: number;
  devueltas: number;
  pendientes: number;
  promedio_aprobacion_dias: number | null;
};

export type AssistantReport = {
  kind: 'report';
  title: string;
  message: string;
  query: AssistantQuery;
  summary: ReportMetric;
  rows: (ReportMetric & { label: string })[];
  groupsLimited: boolean;
  previous: { label: string; summary: ReportMetric; limited: boolean } | null;
  periodLabel: string;
  limited: boolean;
  suggestedQuestions: string[];
  sourceCount: number;
  sourcesLimited: boolean;
  sources: {
    id: string;
    technician: string;
    site: string;
    period: string;
    status: string;
    total: number;
  }[];
};

export type AssistantResponse =
  | { kind: 'clarification'; message: string; suggestedQuestions: string[] }
  | AssistantReport;

export const assistantApi = {
  chat: (message: string, previousQuery?: AssistantQuery) =>
    apiFetch<AssistantResponse>('/admin/assistant/chat', {
      method: 'POST',
      body: { message, previousQuery },
    }),

  transcribe: (audio: Blob) => {
    const formData = new FormData();
    const extension = audio.type.includes('mp4') ? 'm4a' : 'webm';
    formData.append('audio', audio, `consulta.${extension}`);
    return apiUpload<{ text: string }>('/admin/assistant/transcribe', formData);
  },
};
