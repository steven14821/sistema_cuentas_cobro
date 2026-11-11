import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Mic, MicOff, Send, Sparkles } from 'lucide-react';
import { MainLayout } from '../../layouts/MainLayout';
import { formatCOP } from '../../lib/period';
import { downloadReportPdf, type ReportData } from '../../lib/report';
import {
  assistantApi,
  type AssistantQuery,
  type AssistantResponse,
  type AssistantReport,
} from '../../services/assistantApi';
import './assistant.css';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
  response?: AssistantResponse;
};

const STARTER_QUESTIONS = [
  '¿Cuánto se cobró este año, separado por sede?',
  'Compara octubre con septiembre por técnico',
  'Muéstrame las cuentas observadas y rechazadas',
];

export const AssistantPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      text: 'Pídeme un resumen de cuentas, cobros, servicios, estados o tiempos de aprobación. Puedo agruparlos por período, sede, técnico o tipo de servicio y preparar un PDF.',
    },
  ]);
  const [input, setInput] = useState('');
  const [previousQuery, setPreviousQuery] = useState<AssistantQuery>();
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending, transcribing]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const sendMessage = async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || sending) return;
    setError('');
    setInput('');
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setSending(true);
    try {
      const response = await assistantApi.chat(message, previousQuery);
      if (response.kind === 'report') setPreviousQuery(response.query);
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: response.message, response },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo generar el reporte.');
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    setError('');
    setVoiceNotice('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar audio. Puedes escribir la consulta.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (audio.size === 0) return;
        setTranscribing(true);
        try {
          const result = await assistantApi.transcribe(audio);
          setInput(result.text);
          setVoiceNotice('Revisa la transcripción y envíala cuando esté lista.');
        } catch (transcriptionError) {
          setError(transcriptionError instanceof Error ? transcriptionError.message : 'No se pudo transcribir el audio.');
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch {
      setError('No se pudo acceder al micrófono. Revisa el permiso del navegador.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const downloadPdf = (report: AssistantReport) => {
    const toPdfRow = (label: string, metric: AssistantReport['summary']) => ({
      label,
      cuentas: metric.cuentas,
      servicios: metric.servicios,
      total: formatCOP(metric.total_cobrado),
      aprobadas: metric.aprobadas,
      devueltas: metric.devueltas,
      pendientes: metric.pendientes,
      promedio: metric.promedio_aprobacion_dias ?? '—',
    });
    const pdf: ReportData = {
      title: report.title,
      subtitle: `${report.periodLabel} · generado ${new Date().toLocaleDateString('es-CO')}`,
      orientation: 'landscape',
      columns: [
        { header: 'Grupo', key: 'label' },
        { header: 'Cuentas', key: 'cuentas', align: 'right' },
        { header: 'Servicios', key: 'servicios', align: 'right' },
        { header: 'Total cobrado', key: 'total', align: 'right' },
        { header: 'Aprobadas', key: 'aprobadas', align: 'right' },
        { header: 'Devueltas', key: 'devueltas', align: 'right' },
        { header: 'Pendientes', key: 'pendientes', align: 'right' },
        { header: 'Aprobación (días)', key: 'promedio', align: 'right' },
      ],
      ...(report.previous
        ? {
            rows: [
              ...report.rows.map((row) => toPdfRow(row.label, row)),
              toPdfRow(`Total ${report.periodLabel}`, report.summary),
              toPdfRow(`Total ${report.previous.label}`, report.previous.summary),
            ],
          }
        : {
            rows: [
              ...report.rows.map((row) => toPdfRow(row.label, row)),
              toPdfRow(`Total ${report.periodLabel}`, report.summary),
            ],
          }),
      totalsLabel: 'Total cobrado',
      totalsValue: formatCOP(report.summary.total_cobrado),
    };
    downloadReportPdf(pdf, `reporte-cuentas-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <MainLayout>
      <div className="assistant-page">
        <header className="assistant-page-heading">
          <div>
            <div className="assistant-eyebrow"><Sparkles size={14} /> Asistente administrativo</div>
            <h1>Pregunta. Verifica. Descarga.</h1>
            <p>Consulta las cuentas en lenguaje natural y recibe resultados respaldados por los registros del sistema.</p>
          </div>
          <div className="assistant-data-mark">
            <span className="assistant-data-dot" />
            Cálculos desde la base de cuentas
          </div>
        </header>

        <div className="assistant-layout">
          <section className="assistant-chat-panel" aria-label="Conversación de reportes">
            <div className="assistant-chat-topline">
              <div>
                <strong>Consulta de cuentas</strong>
                <span>Escribe o dicta una pregunta</span>
              </div>
              <FileText size={19} aria-hidden="true" />
            </div>

            <div className="assistant-messages" aria-live="polite">
              {messages.map((message, index) => (
                <article key={`${message.role}-${index}`} className={`assistant-message is-${message.role}`}>
                  <p>{message.text}</p>
                  {message.response?.kind === 'report' && (
                    <ReportResult
                      report={message.response}
                      onDownload={() => downloadPdf(message.response as AssistantReport)}
                      onOpenAccount={(id) => navigate(`/admin/cuentas/${id}`)}
                      onAsk={(question) => void sendMessage(question)}
                    />
                  )}
                  {message.response?.kind === 'clarification' && (
                    <SuggestionButtons
                      suggestions={STARTER_QUESTIONS}
                      onAsk={(question) => void sendMessage(question)}
                    />
                  )}
                </article>
              ))}
              {(sending || transcribing) && (
                <div className="assistant-progress" role="status">
                  <span className="assistant-progress-dot" />
                  {transcribing ? 'Transcribiendo tu consulta…' : 'Consultando los registros…'}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {error && <div className="assistant-error" role="alert">{error}</div>}
            {voiceNotice && <div className="assistant-voice-notice" role="status">{voiceNotice}</div>}
            <form
              className="assistant-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(input);
              }}
            >
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder="Ej.: cuánto se cobró en octubre por sede…"
                aria-label="Escribe tu consulta"
                rows={2}
                maxLength={500}
                disabled={sending || recording || transcribing}
              />
              <div className="assistant-composer-actions">
                <span>Enter para enviar · Shift + Enter para nueva línea</span>
                <div>
                  <button
                    className={`assistant-mic-button${recording ? ' is-recording' : ''}`}
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={sending || transcribing}
                    aria-label={recording ? 'Detener grabación' : 'Grabar consulta'}
                    aria-pressed={recording}
                    title={recording ? 'Detener grabación' : 'Consultar por voz'}
                  >
                    {recording ? <MicOff size={17} /> : <Mic size={17} />}
                  </button>
                  <button className="assistant-send-button" type="submit" disabled={!input.trim() || sending || recording}>
                    <Send size={16} /> Consultar
                  </button>
                </div>
              </div>
            </form>
          </section>

          <aside className="assistant-side-panel">
            <div className="assistant-side-heading">Prueba con una pregunta</div>
            <SuggestionButtons
              suggestions={STARTER_QUESTIONS}
              onAsk={(question) => void sendMessage(question)}
            />
            <div className="assistant-privacy-note">
              <strong>Privacidad y precisión</strong>
              <p>OpenAI recibe tu consulta para interpretarla y, si usas el micrófono, transcribirla. Los registros de cuentas no se envían al modelo: el servidor aplica filtros permitidos y calcula las cifras.</p>
            </div>
            <div className="assistant-report-note">
              <Download size={17} />
              <div>
                <strong>Reporte listo para compartir</strong>
                <p>Descarga cada resultado en PDF con sus cifras y agrupaciones.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
};

function SuggestionButtons({
  suggestions,
  onAsk,
}: {
  suggestions: string[];
  onAsk: (question: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="assistant-suggestions">
      {suggestions.map((question) => (
        <button key={question} type="button" onClick={() => onAsk(question)}>
          {question}
        </button>
      ))}
    </div>
  );
}

function ReportResult({
  report,
  onDownload,
  onOpenAccount,
  onAsk,
}: {
  report: AssistantReport;
  onDownload: () => void;
  onOpenAccount: (id: string) => void;
  onAsk: (question: string) => void;
}) {
  return (
    <div className="assistant-report">
      <div className="assistant-report-heading">
        <div>
          <span>{report.periodLabel}</span>
          <h2>{report.title}</h2>
        </div>
        <button type="button" onClick={onDownload}><Download size={15} /> Descargar PDF</button>
      </div>
      <div className="assistant-metric-strip">
        <Metric label="Cuentas" value={report.summary.cuentas.toLocaleString('es-CO')} />
        <Metric label="Servicios" value={report.summary.servicios.toLocaleString('es-CO')} />
        <Metric label="Cobrado" value={formatCOP(report.summary.total_cobrado)} />
        <Metric label="Devueltas" value={report.summary.devueltas.toLocaleString('es-CO')} />
      </div>
      {report.previous && (
        <div className="assistant-compare-card">
          <strong>Comparación · {report.previous.label}</strong>
          <span>{report.previous.summary.cuentas} cuentas</span>
          <span>{formatCOP(report.previous.summary.total_cobrado)} cobrados</span>
          <span>{report.previous.summary.devueltas} devueltas</span>
        </div>
      )}
      {report.limited && (
        <p className="assistant-limit-note">El reporte usa las 2.000 cuentas más recientes para este período.</p>
      )}
      {report.groupsLimited && (
        <p className="assistant-limit-note">Se muestran hasta 100 agrupaciones; el total incluye todas.</p>
      )}
      <div className="assistant-report-table-wrap">
        <table className="assistant-report-table">
          <thead>
            <tr>
              <th>Grupo</th><th>Cuentas</th><th>Servicios</th><th>Total cobrado</th><th>Devueltas</th><th>Pendientes</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.cuentas}</td>
                <td>{row.servicios}</td>
                <td>{formatCOP(row.total_cobrado)}</td>
                <td>{row.devueltas}</td>
                <td>{row.pendientes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.sources.length > 0 && (
        <details className="assistant-source-details">
          <summary>
            Ver cuentas que respaldan el reporte ({report.sourcesLimited
              ? `muestra de 100 de ${report.sourceCount}`
              : report.sourceCount})
          </summary>
          <div className="assistant-source-list">
            {report.sources.map((source) => (
              <button key={source.id} type="button" onClick={() => onOpenAccount(source.id)}>
                <span><strong>{source.technician}</strong><small>{source.site} · {source.period} · {source.status}</small></span>
                <strong>{formatCOP(source.total)}</strong>
              </button>
            ))}
          </div>
        </details>
      )}
      <SuggestionButtons suggestions={report.suggestedQuestions} onAsk={onAsk} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
