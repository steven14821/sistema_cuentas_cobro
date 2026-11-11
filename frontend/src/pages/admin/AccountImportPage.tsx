import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, FileText, LoaderCircle, Plus, ScanLine, Trash2, Upload } from 'lucide-react';
import { MainLayout } from '../../layouts/MainLayout';
import { apiFetch, apiUpload } from '../../lib/api';
import { formatCOP, getColombiaToday, getPeriodoARadicar, nombreMes } from '../../lib/period';
import { reviewApi, type AccountImportServicePayload, type UserRow } from '../../services/adminApi';
import type { TipoServicioApi } from '../../services/technicianApi';
import './account-import.css';

type ParsedService = {
  id: string;
  numero_orden: string;
  tipo_servicio: string | null;
  tipo_servicio_id: string;
  descripcion_especifica: string;
  valor_cobrado: string;
  es_traslado: boolean;
  destino: string;
  transporte: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA' | '';
  confianza: 'alta' | 'media' | 'baja';
};

type ExtractedService = {
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

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const AccountImportPage = () => {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [technicians, setTechnicians] = useState<UserRow[]>([]);
  const [types, setTypes] = useState<TipoServicioApi[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [services, setServices] = useState<ParsedService[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const periodo = getPeriodoARadicar(getColombiaToday());

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<UserRow[]>('/admin/users'),
      apiFetch<TipoServicioApi[]>('/services/types'),
    ]).then(([users, serviceTypes]) => {
      if (!active) return;
      setTechnicians(users.filter((user) => user.rol === 'Tecnico' && user.activo));
      setTypes(serviceTypes.filter((type) => type.activo));
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const total = useMemo(
    () => services.reduce((sum, service) => sum + (Number(service.valor_cobrado) || 0), 0),
    [services],
  );
  const readyToSave = !!technicianId && services.length > 0 && services.every((service) =>
    /^\d{5}$/.test(service.numero_orden) &&
    !!service.tipo_servicio_id &&
    service.valor_cobrado !== '' &&
    Number.isFinite(Number(service.valor_cobrado)) &&
    Number(service.valor_cobrado) >= 0 &&
    (!service.es_traslado || (!!service.destino.trim() && !!service.transporte)),
  );

  const updateService = (id: string, patch: Partial<ParsedService>) => {
    setServices((previous) => previous.map((service) =>
      service.id === id ? { ...service, ...patch } : service,
    ));
  };

  const handlePdf = async (file?: File) => {
    if (!file) return;
    setError('');
    setNotice('');
    setServices([]);
    if (file.type !== 'application/pdf' || file.size > 4 * 1024 * 1024) {
      setError('Selecciona un PDF de máximo 4 MB.');
      return;
    }

    setFileName(file.name);
    setReading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await apiUpload<{ services: ExtractedService[] }>('/admin/account-import/preview', body);
      const parsed = result.services.map((service) => ({
        ...service,
        id: crypto.randomUUID(),
        numero_orden: service.numero_orden.slice(0, 5),
        tipo_servicio_id: service.tipo_servicio_id ?? '',
        valor_cobrado: service.valor_cobrado === null ? '' : String(service.valor_cobrado),
        destino: service.destino ?? '',
        transporte: service.transporte ?? '' as ParsedService['transporte'],
      }));
      if (parsed.length === 0) {
        setError('No se encontraron servicios en el PDF. Verifica que sea una cuenta legible.');
      } else {
        setServices(parsed);
        setNotice(`Se detectaron ${parsed.length} ${parsed.length === 1 ? 'servicio' : 'servicios'}. Verifica cada dato antes de guardarlos.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el PDF.');
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addManualService = () => {
    setServices((previous) => [...previous, {
      id: crypto.randomUUID(),
      numero_orden: '',
      tipo_servicio: null,
      tipo_servicio_id: '',
      descripcion_especifica: '',
      valor_cobrado: '',
      es_traslado: false,
      destino: '',
      transporte: '',
      confianza: 'baja',
    }]);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!readyToSave) {
      setError('Completa técnico, orden, tipo y valor. Los traslados también requieren destino y transporte.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const payload: AccountImportServicePayload[] = services.map((service) => ({
        numero_orden: service.numero_orden,
        tipo_servicio_id: service.tipo_servicio_id,
        descripcion_especifica: service.descripcion_especifica.trim(),
        valor_cobrado: Number(service.valor_cobrado),
        es_traslado: service.es_traslado,
        ...(service.es_traslado ? {
          destino: service.destino.trim(),
          transporte: service.transporte as 'MOTO_PROPIA' | 'VEHICULO_EMPRESA',
        } : {}),
      }));
      const account = await reviewApi.createAccountImport(technicianId, payload);
      navigate(`/admin/cuentas/${account.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la cuenta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <main className="account-import-page">
        <button className="account-import-back" type="button" onClick={() => navigate('/admin/review')}>
          <ArrowLeft size={16} /> Volver a revisión
        </button>
        <header className="account-import-header">
          <div className="account-import-mark"><ScanLine size={21} /></div>
          <div>
            <p className="account-import-eyebrow">Ingreso asistido · {nombreMes(periodo.mes)} {periodo.anio}</p>
            <h1>Importar cuenta desde PDF</h1>
            <p>Extraemos órdenes, servicios y traslados. Tú asignas al técnico y confirmas cada dato.</p>
          </div>
        </header>

        <section className="account-import-source">
          <label className="account-import-field">
            <span>Técnico responsable</span>
            <select
              value={technicianId}
              onChange={(event) => setTechnicianId(event.target.value)}
              disabled={loading || reading || saving}
            >
              <option value="">Selecciona un técnico...</option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.nombre_completo} · {technician.sede ?? 'Sin sede'}
                </option>
              ))}
            </select>
          </label>

          <input
            ref={fileRef}
            className="account-import-hidden-input"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => void handlePdf(event.target.files?.[0])}
          />
          <button
            className="account-import-file-button"
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading || reading || saving}
          >
            {reading ? <LoaderCircle className="account-import-spin" size={18} /> : <Upload size={18} />}
            {reading ? 'Leyendo documento...' : fileName || 'Elegir PDF'}
          </button>
        </section>

        <p className="account-import-privacy">
          <FileText size={15} />
          El PDF se envía a OpenAI para extraer los datos. La aplicación no guarda el archivo original; los servicios solo se guardan cuando confirmas.
        </p>

        {error && <div className="account-import-alert" role="alert"><AlertCircle size={17} />{error}</div>}
        {notice && <div className="account-import-notice" role="status"><Check size={17} />{notice}</div>}

        {services.length > 0 && (
          <form onSubmit={handleSave}>
            <div className="account-import-review-head">
              <div>
                <p className="account-import-eyebrow">Revisión antes de guardar</p>
                <h2>{services.length} {services.length === 1 ? 'servicio detectado' : 'servicios detectados'}</h2>
              </div>
              <strong>{formatCOP(total)}</strong>
            </div>

            <div className="account-import-service-list">
              {services.map((service, index) => {
                const validTypes = types.filter((type) =>
                  normalize(type.nombre).includes('traslado') === service.es_traslado,
                );
                const selectedType = types.find((type) => type.id === service.tipo_servicio_id);
                return (
                  <article className="account-import-service" key={service.id}>
                    <div className="account-import-service-top">
                      <span className="account-import-sequence">{String(index + 1).padStart(2, '0')}</span>
                      <div className="account-import-service-label">
                        <strong>{service.es_traslado ? 'Traslado' : 'Servicio'}</strong>
                        <span className={`account-import-confidence confidence-${service.confianza}`}>
                          Lectura {service.confianza}
                        </span>
                      </div>
                      <label className="account-import-switch">
                        <input
                          type="checkbox"
                          checked={service.es_traslado}
                          onChange={(event) => {
                            const transfer = event.target.checked;
                            const nextType = types.find((type) =>
                              normalize(type.nombre).includes('traslado') === transfer,
                            );
                            updateService(service.id, {
                              es_traslado: transfer,
                              tipo_servicio_id: nextType?.id ?? '',
                              destino: transfer ? service.destino : '',
                              transporte: transfer ? service.transporte : '',
                            });
                          }}
                        />
                        <span>Es traslado</span>
                      </label>
                      <button
                        className="account-import-remove"
                        type="button"
                        onClick={() => setServices((previous) => previous.filter((item) => item.id !== service.id))}
                        aria-label={`Quitar servicio ${index + 1}`}
                      ><Trash2 size={16} /></button>
                    </div>
                    <div className="account-import-fields">
                      <label className="account-import-field">
                        <span>Número de orden</span>
                        <input
                          value={service.numero_orden}
                          onChange={(event) => updateService(service.id, {
                            numero_orden: event.target.value.replace(/\D/g, '').slice(0, 5),
                          })}
                          inputMode="numeric"
                          maxLength={5}
                          placeholder="12345"
                          required
                        />
                      </label>
                      <label className="account-import-field">
                        <span>Tipo de servicio</span>
                        <select
                          value={service.tipo_servicio_id}
                          onChange={(event) => updateService(service.id, {
                            tipo_servicio_id: event.target.value,
                            tipo_servicio: types.find((type) => type.id === event.target.value)?.nombre ?? null,
                          })}
                          required
                        >
                          <option value="">Selecciona...</option>
                          {validTypes.map((type) => <option key={type.id} value={type.id}>{type.nombre}</option>)}
                        </select>
                      </label>
                      <label className="account-import-field">
                        <span>Valor cobrado</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={service.valor_cobrado}
                          onChange={(event) => updateService(service.id, { valor_cobrado: event.target.value })}
                          placeholder="0"
                          required
                        />
                      </label>
                      {service.es_traslado && (
                        <>
                          <label className="account-import-field">
                            <span>Destino</span>
                            <input
                              value={service.destino}
                              onChange={(event) => updateService(service.id, { destino: event.target.value })}
                              placeholder="Destino del traslado"
                              required
                            />
                          </label>
                          <label className="account-import-field">
                            <span>Medio de transporte</span>
                            <select
                              value={service.transporte}
                              onChange={(event) => updateService(service.id, {
                                transporte: event.target.value as ParsedService['transporte'],
                              })}
                              required
                            >
                              <option value="">Selecciona...</option>
                              <option value="MOTO_PROPIA">Moto propia</option>
                              <option value="VEHICULO_EMPRESA">Vehículo empresa</option>
                            </select>
                          </label>
                        </>
                      )}
                    </div>
                    <label className="account-import-field account-import-description">
                      <span>Descripción {selectedType && <small>· {selectedType.nombre}</small>}</span>
                      <textarea
                        value={service.descripcion_especifica}
                        onChange={(event) => updateService(service.id, { descripcion_especifica: event.target.value })}
                        rows={2}
                        maxLength={2000}
                        placeholder="Detalles del servicio"
                      />
                    </label>
                  </article>
                );
              })}
            </div>

            <div className="account-import-actions">
              <button className="account-import-add" type="button" onClick={addManualService}>
                <Plus size={16} /> Agregar servicio manual
              </button>
              <button className="account-import-save" type="submit" disabled={!readyToSave || saving}>
                {saving ? <LoaderCircle className="account-import-spin" size={17} /> : <Check size={17} />}
                {saving ? 'Guardando...' : 'Guardar cuenta pendiente'}
              </button>
            </div>
            <p className="account-import-footnote">
              Se añadirá al período vigente como cuenta pendiente, sin radicar. Si el técnico ya radicó o tiene una cuenta en revisión, no se harán cambios.
            </p>
          </form>
        )}
      </main>
    </MainLayout>
  );
};
