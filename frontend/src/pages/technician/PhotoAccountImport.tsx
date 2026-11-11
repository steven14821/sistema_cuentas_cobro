import { useRef, useState } from 'react';
import { AlertCircle, Camera, Check, LoaderCircle, Plus, ScanLine, Trash2, X } from 'lucide-react';
import {
  compressPhoto,
  lugaresBucaramanga,
  lugaresCucuta,
} from '../../components/RegistroFlujoModal';
import { formatCOP } from '../../lib/period';
import {
  technicianApi,
  type ImportedServicePayload,
  type TipoServicioApi,
} from '../../services/technicianApi';
import './photo-account-import.css';

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

type PhotoService = {
  id: string;
  fileName: string;
  numero_orden: string;
  tipo_servicio_id: string;
  descripcion_especifica: string;
  valor_detectado: number | null;
  es_traslado: boolean;
  destino: string;
  transporte: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA' | '';
  confianza: ExtractedService['confianza'];
  fotos: string[];
  puertas_desmontadas: number;
  requiere_ayudante: boolean;
  motivo_ayudante: string;
  error?: string;
};

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function toJpegFile(dataUrl: string, name: string) {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}

export const PhotoAccountImport = ({
  types,
  sede,
  onClose,
  onSaved,
}: {
  types: TipoServicioApi[];
  sede?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [services, setServices] = useState<PhotoService[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const places = normalize(sede ?? '').includes('cuc') ? lugaresCucuta : lugaresBucaramanga;
  const allowsCompanyVehicle = normalize(sede ?? '').includes('cuc');

  const updateService = (id: string, patch: Partial<PhotoService>) => {
    setServices((previous) => previous.map((service) =>
      service.id === id ? { ...service, ...patch, error: undefined } : service,
    ));
  };

  const analyzePhotos = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (!selected.length) return;
    if (services.length + selected.length > 10) {
      setError('Puedes crear hasta 10 servicios por tanda. Guarda esta cuenta antes de cargar más fotos.');
      return;
    }

    setError('');
    setNotice('');
    setAnalyzing(true);
    const analyzed: PhotoService[] = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      setProgress(`Leyendo foto ${index + 1} de ${selected.length}`);
      try {
        if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen.');
        const photo = await compressPhoto(file);
        const uploadFile = await toJpegFile(photo, `evidencia-${index + 1}.jpg`);
        const extracted = await technicianApi.previewPhotoImport(uploadFile);
        const extractedPlace = places.find((place) =>
          normalize(place.id) === normalize(extracted.destino ?? '') ||
          normalize(place.nombre) === normalize(extracted.destino ?? '') ||
          normalize(place.dbNombre) === normalize(extracted.destino ?? ''),
        );
        analyzed.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          numero_orden: extracted.numero_orden,
          tipo_servicio_id: extracted.tipo_servicio_id ?? '',
          descripcion_especifica: extracted.descripcion_especifica,
          valor_detectado: extracted.valor_cobrado,
          es_traslado: extracted.es_traslado,
          destino: extractedPlace?.id ?? '',
          transporte: extracted.transporte === 'VEHICULO_EMPRESA' && !allowsCompanyVehicle
            ? ''
            : extracted.transporte ?? '',
          confianza: extracted.confianza,
          fotos: [photo],
          puertas_desmontadas: 0,
          requiere_ayudante: false,
          motivo_ayudante: '',
        });
      } catch (err) {
        analyzed.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          numero_orden: '',
          tipo_servicio_id: '',
          descripcion_especifica: '',
          valor_detectado: null,
          es_traslado: false,
          destino: '',
          transporte: '',
          confianza: 'baja',
          fotos: [],
          puertas_desmontadas: 0,
          requiere_ayudante: false,
          motivo_ayudante: '',
          error: err instanceof Error ? err.message : 'No se pudo leer la foto.',
        });
      }
    }
    setServices((previous) => [...previous, ...analyzed]);
    setAnalyzing(false);
    setProgress('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const replacePhoto = async (id: string, file?: File) => {
    if (!file) return;
    try {
      const photo = await compressPhoto(file);
      updateService(id, { fotos: [photo], fileName: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo optimizar la foto.');
    }
  };

  const saveServices = async () => {
    setError('');
    setNotice('');
    setSaving(true);
    let saved = 0;
    const failed = new Set<string>();

    for (let index = 0; index < services.length; index += 1) {
      const service = services[index];
      setProgress(`Guardando servicio ${index + 1} de ${services.length}`);
      try {
        const payload: ImportedServicePayload = {
          tipo_servicio_id: service.tipo_servicio_id,
          numero_orden: service.numero_orden,
          valor_cobrado: service.es_traslado
            ? 0
            : Number(types.find((type) => type.id === service.tipo_servicio_id)?.valor_estandar ?? 0) +
              service.puertas_desmontadas * 10_000 +
              (service.requiere_ayudante &&
                !normalize(types.find((type) => type.id === service.tipo_servicio_id)?.nombre ?? '')
                  .includes('incluye ayudante')
                ? 10_000
                : 0),
          es_traslado: service.es_traslado,
          descripcion_especifica: service.descripcion_especifica.trim(),
          fotos: service.fotos,
          puertas_desmontadas: service.puertas_desmontadas,
          requiere_ayudante: service.requiere_ayudante,
          ...(service.requiere_ayudante ? { motivo_ayudante: service.motivo_ayudante.trim() } : {}),
          ...(service.es_traslado ? {
            destino: service.destino.trim(),
            transporte: service.transporte as 'MOTO_PROPIA' | 'VEHICULO_EMPRESA',
          } : {}),
        };
        await technicianApi.createImportedService(payload);
        saved += 1;
      } catch (err) {
        failed.add(service.id);
        updateService(service.id, {
          error: err instanceof Error ? err.message : 'No se pudo guardar este servicio.',
        });
      }
    }

    if (failed.size === 0) {
      await onSaved();
      onClose();
    } else {
      setServices((previous) => previous.filter((service) => failed.has(service.id)));
      setNotice(saved > 0
        ? `Se guardaron ${saved} servicios. Corrige los ${failed.size} que faltan y vuelve a intentar.`
        : 'No se guardó ningún servicio. Corrige los datos marcados e inténtalo de nuevo.');
    }
    setSaving(false);
    setProgress('');
  };

  const canSave = services.length > 0 && !analyzing && !saving && services.every((service) =>
    /^\d{5}$/.test(service.numero_orden) &&
    !!service.tipo_servicio_id &&
    (service.es_traslado
      ? !!service.destino.trim() &&
        !!service.transporte &&
        (service.transporte !== 'VEHICULO_EMPRESA' || allowsCompanyVehicle)
      : (!(service.puertas_desmontadas > 0 || service.requiere_ayudante) || service.fotos.length > 0) &&
        (!service.requiere_ayudante || !!service.motivo_ayudante.trim())),
  );
  const total = services.reduce((sum, service) => {
    if (service.es_traslado) return sum;
    const type = types.find((candidate) => candidate.id === service.tipo_servicio_id);
    if (!type) return sum;
    return sum + Number(type.valor_estandar) +
      service.puertas_desmontadas * 10_000 +
      (service.requiere_ayudante && !normalize(type.nombre).includes('incluye ayudante') ? 10_000 : 0);
  }, 0);

  return (
    <div className="photo-import-backdrop" role="presentation">
      <section className="photo-import-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-import-title">
        <header className="photo-import-header">
          <div className="photo-import-title-icon"><Camera size={19} /></div>
          <div>
            <p className="photo-import-kicker">Registro fotográfico</p>
            <h2 id="photo-import-title">Crear servicios desde fotos</h2>
          </div>
          <button type="button" className="photo-import-close" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </header>

        <p className="photo-import-intro">
          Cada foto se convierte en un servicio editable. Revisa órdenes, tipo, valor y detalles antes de guardar.
        </p>
        <div className="photo-import-disclosure">
          <ScanLine size={15} />
          Las fotos se envían a OpenAI para leer los datos y quedarán adjuntas como evidencia al guardar cada servicio.
        </div>

        <input
          ref={fileRef}
          className="photo-import-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => void analyzePhotos(event.target.files ?? [])}
        />
        <button
          type="button"
          className="photo-import-pick"
          onClick={() => fileRef.current?.click()}
          disabled={analyzing || saving || services.length >= 10}
        >
          {analyzing ? <LoaderCircle className="photo-import-spin" size={18} /> : <Plus size={18} />}
          {analyzing ? progress : 'Agregar fotos'}
        </button>

        {error && <div className="photo-import-alert" role="alert"><AlertCircle size={16} />{error}</div>}
        {notice && <p className="photo-import-notice" role="status">{notice}</p>}

        {services.length > 0 && (
          <>
            <div className="photo-import-summary">
              <span>{services.length} {services.length === 1 ? 'servicio' : 'servicios'} · Tarifas: {formatCOP(total)}</span>
              <small>Los traslados se calculan con las reglas vigentes al guardar.</small>
            </div>
            <div className="photo-import-list">
              {services.map((service, index) => {
                const type = types.find((candidate) => candidate.id === service.tipo_servicio_id);
                const typeName = type?.nombre ?? '';
                const isCollection = /recoleccion|recogida/.test(normalize(typeName));
                const isNevecon = isCollection && normalize(typeName).includes('nevecon');
                const includesHelper = isCollection && normalize(typeName).includes('incluye ayudante');
                const showHelper = isCollection && !includesHelper;
                const selectedTypes = types.filter((candidate) =>
                  normalize(candidate.nombre).includes('traslado') === service.es_traslado,
                );
                return (
                  <article className="photo-import-card" key={service.id}>
                    <div className="photo-import-card-heading">
                      <span className="photo-import-number">{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{service.es_traslado ? 'Traslado' : 'Servicio'} · {service.fileName}</strong>
                        <small className={`photo-import-confidence confidence-${service.confianza}`}>
                          Lectura {service.confianza}
                        </small>
                      </div>
                      <label className="photo-import-transfer-toggle">
                        <input
                          type="checkbox"
                          checked={service.es_traslado}
                          onChange={(event) => {
                            const transfer = event.target.checked;
                            const nextType = types.find((candidate) =>
                              normalize(candidate.nombre).includes('traslado') === transfer,
                            );
                            updateService(service.id, {
                              es_traslado: transfer,
                              tipo_servicio_id: nextType?.id ?? '',
                              destino: transfer ? service.destino : '',
                              transporte: transfer ? service.transporte : '',
                            });
                          }}
                        />
                        Traslado
                      </label>
                      <button
                        type="button"
                        className="photo-import-remove"
                        onClick={() => setServices((previous) => previous.filter((item) => item.id !== service.id))}
                        aria-label={`Quitar servicio ${index + 1}`}
                      ><Trash2 size={16} /></button>
                    </div>

                    {service.error && <p className="photo-import-card-error">{service.error}</p>}
                    <div className="photo-import-grid">
                      <label>
                        Número de orden
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
                      <label className="photo-import-type">
                        Tipo de servicio
                        <select
                          value={service.tipo_servicio_id}
                          onChange={(event) => {
                            const nextType = types.find((candidate) => candidate.id === event.target.value);
                            const transfer = !!nextType && normalize(nextType.nombre).includes('traslado');
                            const nextPlace = transfer ? places.find((place) =>
                              normalize(nextType.nombre).includes(normalize(place.nombre)) ||
                              normalize(nextType.nombre).includes(normalize(place.dbNombre)),
                            ) : undefined;
                            updateService(service.id, {
                              tipo_servicio_id: event.target.value,
                              es_traslado: transfer,
                              destino: transfer ? nextPlace?.id ?? service.destino : '',
                              transporte: transfer ? service.transporte : '',
                            });
                          }}
                          required
                        >
                          <option value="">Selecciona un tipo...</option>
                          {selectedTypes.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>{candidate.nombre}</option>
                          ))}
                        </select>
                      </label>
                      {service.es_traslado ? (
                        <>
                          <label>
                            Destino
                            <select
                              value={service.destino}
                              onChange={(event) => updateService(service.id, { destino: event.target.value })}
                              required
                            >
                              <option value="">Selecciona un destino...</option>
                              {places.map((place) => (
                                <option key={place.id} value={place.id}>{place.nombre}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Transporte
                            <select
                              value={service.transporte}
                              onChange={(event) => updateService(service.id, {
                                transporte: event.target.value as PhotoService['transporte'],
                              })}
                              required
                            >
                              <option value="">Selecciona...</option>
                              <option value="MOTO_PROPIA">Moto propia</option>
                              {allowsCompanyVehicle && <option value="VEHICULO_EMPRESA">Vehículo empresa</option>}
                            </select>
                          </label>
                        </>
                      ) : (
                        <div className="photo-import-calculated">
                          <span>Tarifa vigente</span>
                          <strong>{type
                            ? formatCOP(
                                Number(type.valor_estandar) +
                                service.puertas_desmontadas * 10_000 +
                                (service.requiere_ayudante && !includesHelper ? 10_000 : 0),
                              )
                            : 'Selecciona un tipo'}
                          </strong>
                          {service.valor_detectado !== null && type &&
                            Math.abs(
                              service.valor_detectado -
                              (Number(type.valor_estandar) +
                                service.puertas_desmontadas * 10_000 +
                                (service.requiere_ayudante && !includesHelper ? 10_000 : 0)),
                            ) > 1 && (
                              <small>La foto muestra {formatCOP(service.valor_detectado)}; se usará la tarifa actual.</small>
                            )}
                        </div>
                      )}
                    </div>

                    <label className="photo-import-description">
                      Descripción
                      <textarea
                        rows={2}
                        maxLength={2000}
                        value={service.descripcion_especifica}
                        onChange={(event) => updateService(service.id, { descripcion_especifica: event.target.value })}
                        placeholder="Detalles de la orden"
                      />
                    </label>

                    {!service.es_traslado && (isNevecon || showHelper) && (
                      <div className="photo-import-extras">
                        {isNevecon && (
                          <label>
                            Puertas desmontadas
                            <select
                              value={service.puertas_desmontadas}
                              onChange={(event) => updateService(service.id, {
                                puertas_desmontadas: Number(event.target.value),
                              })}
                            >
                              {[0, 1, 2, 3, 4].map((number) => (
                                <option key={number} value={number}>{number}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        {showHelper && (
                          <label className="photo-import-checkbox">
                            <input
                              type="checkbox"
                              checked={service.requiere_ayudante}
                              onChange={(event) => updateService(service.id, {
                                requiere_ayudante: event.target.checked,
                              })}
                            />
                            Requiere ayudante
                          </label>
                        )}
                        {service.requiere_ayudante && (
                          <label className="photo-import-reason">
                            Motivo del ayudante
                            <input
                              value={service.motivo_ayudante}
                              onChange={(event) => updateService(service.id, { motivo_ayudante: event.target.value })}
                              maxLength={300}
                              required
                            />
                          </label>
                        )}
                      </div>
                    )}

                    <div className="photo-import-evidence">
                      <div className="photo-import-thumbs">
                        {service.fotos.map((photo) => (
                          <div key={photo} className="photo-import-thumb">
                            <img src={photo} alt={`Evidencia de la orden ${service.numero_orden || index + 1}`} />
                            <button
                              type="button"
                              onClick={() => updateService(service.id, { fotos: [] })}
                              aria-label="Quitar foto"
                            ><X size={13} /></button>
                          </div>
                        ))}
                        <label className="photo-import-replace">
                          <Camera size={15} />
                          {service.fotos.length ? 'Cambiar foto' : 'Adjuntar foto'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(event) => void replacePhoto(service.id, event.target.files?.[0])}
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        <footer className="photo-import-footer">
          <p>La cuenta quedará pendiente y sin radicar. Revisa los servicios en el portal y radica cuando estén completos.</p>
          <div>
            <button type="button" className="photo-import-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="button" className="photo-import-save" onClick={() => void saveServices()} disabled={!canSave}>
              {saving ? <LoaderCircle className="photo-import-spin" size={17} /> : <Check size={17} />}
              {saving ? progress : 'Guardar servicios'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};
