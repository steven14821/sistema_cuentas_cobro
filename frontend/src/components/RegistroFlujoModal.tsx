import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { technicianApi, type ServiceApi } from '../services/technicianApi';
import { formatCOP } from '../lib/period';
import { AlertCircle, Check, Receipt, ScanLine, Truck, User } from 'lucide-react';
import { clearServiceDraft, getServiceDraft, QueuedOfflineError, saveServiceDraft } from '../lib/offlineStore';

type TransportType = 'MOTO_PROPIA' | 'EMPRESA';
type MarcaOption = 'SAMSUNG' | 'HISENSE' | 'HYUNDAI' | 'TCL' | 'ZURICH';

type Paso =
  | { kind: 'servicio' }
  | { kind: 'traslado'; servicioId: string; tipoId: string; tipoNombre: string; valorBase: number; valorServicio: number; puertasDesmontadas: number; requiereAyudante: boolean; numeroOrden: string }
  | { kind: 'final'; servicioId: string; tipoNombre: string; valorBase: number; valorServicio: number; puertasDesmontadas: number; requiereAyudante: boolean; trasladoId: string; trasladoNombre: string; trasladoValor: number; numeroOrden: string }
  | { kind: 'error'; message: string };

export interface TipoServicioOption {
  id: string;
  nombre: string;
  valor_estandar: number;
}

// Catálogo de destinos por sede y su tarifa fija directa
export const lugaresBucaramanga = [
  { id: 'PIEDECUESA', nombre: 'Piedecuesta', valor: 8000, dbNombre: 'TRASLADO: Piedecuesta' },
  { id: 'GIRON', nombre: 'Girón', valor: 5000, dbNombre: 'TRASLADO: Giron' },
  { id: 'LEBRIJA', nombre: 'Lebrija', valor: 10000, dbNombre: 'TRASLADO: Lebrija' },
  { id: 'FLORIDA', nombre: 'Florida', valor: 3000, dbNombre: 'TRASLADO: Florida' },
  { id: 'LOS_SANTOS', nombre: 'Los Santos', valor: 25000, dbNombre: 'TRASLADO: Los Santos' },
  { id: 'RIONEGRO_PLAYON', nombre: 'Rionegro / Playón', valor: 30000, dbNombre: 'TRASLADO: Rionegro-Playon' },
  { id: 'PESCADERO', nombre: 'Pescadero', valor: 25000, dbNombre: 'TRASLADO: Pescadero' },
  { id: 'ZAPATOCA', nombre: 'Zapatoca', valor: 60000, dbNombre: 'TRASLADO: Zapatoca' },
  { id: 'CUARESMA', nombre: 'Cuaresma', valor: 12000, dbNombre: 'TRASLADO: Curos' },
  { id: 'SOGAMOSO', nombre: 'Sogamoso', valor: 35000, dbNombre: 'TRASLADO: Sogamoso' },
  { id: 'MATANZA', nombre: 'Matanza', valor: 25000, dbNombre: 'TRASLADO: Matanza' },
  { id: 'ACAPULCO', nombre: 'Acapulco', valor: 9000, dbNombre: 'TRASLADO: Acapulco' },
  { id: 'SAN_VICENTE', nombre: 'San Vicente', valor: 75000, dbNombre: 'TRASLADO: San Vicente' },
  { id: 'BARRANCABERMEJA', nombre: 'Barrancabermeja', valor: 85000, dbNombre: 'TRASLADO: Barrancabermeja' },
  { id: 'SAN_GIL', nombre: 'San Gil', valor: 95000, dbNombre: 'TRASLADO: San Gil' },
] as const;

export const lugaresCucuta = [
  { id: 'PATIOS', nombre: 'Patios', valor: 4000, dbNombre: 'TRASLADO CUC: Patios' },
  { id: 'VILLA_DEL_ROSARIO', nombre: 'Villa del Rosario', valor: 4000, dbNombre: 'TRASLADO CUC: Villa del Rosario' },
  { id: 'ZULIA', nombre: 'Zulia', valor: 8000, dbNombre: 'TRASLADO CUC: Zulia' },
  { id: 'TOLEDO', nombre: 'Toledo', valor: 140000, dbNombre: 'TRASLADO CUC: Toledo' },
  { id: 'PAMPLONA', nombre: 'Pamplona', valor: 55000, dbNombre: 'TRASLADO CUC: Pamplona' },
  { id: 'MUTISCA', nombre: 'Mutiscua', valor: 65000, dbNombre: 'TRASLADO CUC: Mutiscua' },
  { id: 'CHINACOTA', nombre: 'Chinácota', valor: 30000, dbNombre: 'TRASLADO CUC: Chinácota' },
  { id: 'DURANIA', nombre: 'Durania', valor: 35000, dbNombre: 'TRASLADO CUC: Durania' },
  { id: 'BOCHALEMA', nombre: 'Bochalema', valor: 35000, dbNombre: 'TRASLADO CUC: Bochalema' },
] as const;

const tipoVehiculoLabel: Record<TransportType, string> = {
  MOTO_PROPIA: 'Moto propia',
  EMPRESA: 'Vehículo empresa',
};

const marcasDisponibles: MarcaOption[] = ['SAMSUNG', 'HISENSE', 'HYUNDAI', 'TCL', 'ZURICH'];

function requiereTraslado(tipoNombre: string): boolean {
  const nombre = tipoNombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return !/carry[\s-]*in/.test(nombre) && !nombre.includes('instalacion');
}

export const RegistroFlujoModal = ({
  open,
  onClose,
  onCreateService,
  onCreateTransfer,
  onDeleteService,
  onQuoteTransfer,
  types,
  recentOrders = [],
  existingOrders = [],
  currentServices = [],
}: {
  open: boolean;
  onClose: () => void;
  onCreateService: (payload: {
    tipo_servicio_id: string;
    numero_orden: string;
    descripcion_especifica: string;
    fotos_puertas?: string[];
    fotos_ayudante?: string[];
    puertas_desmontadas?: number;
    requiere_ayudante?: boolean;
    motivo_ayudante?: string;
  }) => Promise<ServiceApi>;
  onCreateTransfer: (payload: { tipo_servicio_id: string; numero_orden: string; descripcion_especifica: string; destino: string; transporte: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA'; valor_cobrado?: number }) => Promise<{ servicio: ServiceApi; valor_cobrado: number }>;
  onDeleteService: (id: string) => Promise<unknown>;
  onQuoteTransfer: (payload: { tipo_servicio_id: string; numero_orden: string; destino: string; transporte: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA' }) => Promise<number>;
  types: TipoServicioOption[];
  recentOrders?: string[];
  existingOrders?: string[];
  currentServices?: ServiceApi[];
}) => {
  const { user } = useAuth();
  const sede = (user?.sede ?? 'Bucaramanga').toLowerCase().includes('cuc') ? 'Cúcuta' : 'Bucaramanga';

  const [paso, setPaso] = useState<Paso>({ kind: 'servicio' });
  const [numeroOrden, setNumeroOrden] = useState('');
  const [marcaSeleccionada, setMarcaSeleccionada] = useState<MarcaOption>('SAMSUNG');
  const [tipoId, setTipoId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [desmontoPuertas, setDesmontoPuertas] = useState(false);
  const [puertasDesmontadas, setPuertasDesmontadas] = useState(0);
  const [requiereAyudante, setRequiereAyudante] = useState(false);
  const [motivoAyudante, setMotivoAyudante] = useState('');
  const [transportType, setTransportType] = useState<TransportType>('MOTO_PROPIA');
  const [lugarId, setLugarId] = useState('');
  const [saving, setSaving] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [transferQuote, setTransferQuote] = useState<number | null>(null);
  const [activeValidation, setActiveValidation] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fotosPuertas, setFotosPuertas] = useState<string[]>([]);
  const [fotosAyudante, setFotosAyudante] = useState<string[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMessage, setOcrMessage] = useState('');
  const puertasPhotoInput = useRef<HTMLInputElement>(null);
  const ayudantePhotoInput = useRef<HTMLInputElement>(null);
  const orderPhotoInput = useRef<HTMLInputElement>(null);
  const quoteRequestId = useRef(0);

  useEffect(() => {
    if (!open || !user?.id) return;
    let active = true;
    setDraftReady(false);
    getServiceDraft(user.id).then((draft) => {
      if (!active) return;
      if (draft) {
        setNumeroOrden(draft.numeroOrden);
        setMarcaSeleccionada(marcasDisponibles.find((marca) => marca === draft.marcaSeleccionada) ?? 'SAMSUNG');
        setTipoId(draft.tipoId);
        setDescripcion(draft.descripcion);
        setDesmontoPuertas(draft.desmontoPuertas);
        setPuertasDesmontadas(draft.puertasDesmontadas);
        setRequiereAyudante(draft.requiereAyudante);
        setMotivoAyudante(draft.motivoAyudante);
        setFotosPuertas(draft.fotosPuertas);
        setFotosAyudante(draft.fotosAyudante);
      }
      setDraftReady(true);
    }).catch((err) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : 'No se pudo recuperar el borrador local.');
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [open, user?.id]);

  useEffect(() => {
    if (!open || !user?.id || !draftReady || paso.kind !== 'servicio') return;
    const hasContent = Boolean(
      numeroOrden || tipoId || descripcion || desmontoPuertas || requiereAyudante ||
      fotosPuertas.length || fotosAyudante.length,
    );
    const timeout = window.setTimeout(() => {
      const task = hasContent
        ? saveServiceDraft(user.id, {
            numeroOrden,
            marcaSeleccionada,
            tipoId,
            descripcion,
            desmontoPuertas,
            puertasDesmontadas,
            requiereAyudante,
            motivoAyudante,
            fotosPuertas,
            fotosAyudante,
          })
        : clearServiceDraft(user.id);
      task.catch((err) => setError(err instanceof Error ? err.message : 'No se pudo guardar el borrador local.'));
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [open, user?.id, draftReady, paso.kind, numeroOrden, marcaSeleccionada, tipoId, descripcion,
    desmontoPuertas, puertasDesmontadas, requiereAyudante, motivoAyudante, fotosPuertas, fotosAyudante]);

  if (!open) return null;

  // Filtrar tipos de servicio según la marca seleccionada
  const tiposFiltradosPorMarca = types.filter((t) => {
    if (t.nombre.startsWith('TRASLADO')) return false;
    return t.nombre.toUpperCase().startsWith(`${marcaSeleccionada}:`);
  });

  const lugares = sede === 'Cúcuta' ? lugaresCucuta : lugaresBucaramanga;

  const tipoActual = types.find((t) => t.id === tipoId) ?? null;
  const tipoValor = tipoActual ? Number(tipoActual.valor_estandar) : 0;
  const nombreTipoNormalizado = tipoActual?.nombre.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase() ?? '';
  const esRecoleccion = /recoleccion|recogida/.test(nombreTipoNormalizado);
  const incluyeAyudante = esRecoleccion && nombreTipoNormalizado.includes('incluye ayudante');
  const esRecoleccionConAyudanteOpcional = esRecoleccion && !incluyeAyudante;
  const esRecogidaNevecon = esRecoleccion && nombreTipoNormalizado.includes('nevecon');
  const requiereFotoPuertas = esRecogidaNevecon && desmontoPuertas;
  const requiereFotoAyudante = esRecoleccionConAyudanteOpcional && requiereAyudante;
  const cantidadPuertasValida = Number.isInteger(puertasDesmontadas) &&
    puertasDesmontadas >= 1 && puertasDesmontadas <= 4;
  const costoPuertas = desmontoPuertas && cantidadPuertasValida
    ? puertasDesmontadas * 10_000
    : 0;
  const costoAyudante = requiereAyudante ? 10_000 : 0;
  const totalAdicionales = costoPuertas + costoAyudante;

  const lugarSeleccionado = lugares.find((l) => l.id === lugarId) ?? null;

  const trasladoCalculado = lugarSeleccionado ? (transferQuote ?? 0) : 0;

  const cotizarTraslado = async (nextLugarId: string, nextTransportType: TransportType) => {
    const requestId = ++quoteRequestId.current;
    const lugar = lugares.find((item) => item.id === nextLugarId);
    if (!lugar) {
      setTransferQuote(null);
      setQuoteLoading(false);
      return;
    }

    const tipoTrasladoDb = types.find((type) => type.nombre.toLowerCase() === lugar.dbNombre.toLowerCase()) ||
      types.find((type) => type.nombre.toLowerCase().includes(lugar.nombre.toLowerCase()));
    if (!tipoTrasladoDb || paso.kind !== 'traslado') {
      setTransferQuote(null);
      setQuoteLoading(false);
      setError(`Tarifa de traslado no reconocida en catálogo para "${lugar.nombre}".`);
      return;
    }

    setQuoteLoading(true);
    setTransferQuote(null);
    setError('');
    try {
      let quote: number;
      if (navigator.onLine) {
        quote = await onQuoteTransfer({
          tipo_servicio_id: tipoTrasladoDb.id,
          numero_orden: paso.numeroOrden,
          destino: nextLugarId,
          transporte: nextTransportType === 'MOTO_PROPIA' ? 'MOTO_PROPIA' : 'VEHICULO_EMPRESA',
        });
      } else {
        const standard = Number(tipoTrasladoDb.valor_estandar);
        const pendingServices = currentServices
          .filter((service) => !['Aprobado', 'Observado', 'Rechazado'].includes(service.estado))
          .map((service) => Number(service.valor_cobrado));
        pendingServices.push(paso.valorServicio);
        if (nextTransportType === 'MOTO_PROPIA') {
          quote = sede === 'Cúcuta' ? lugar.valor + standard : lugar.valor;
        } else if (sede !== 'Cúcuta') {
          throw new Error('El vehículo empresa solo está disponible para Cúcuta.');
        } else if (nextLugarId.includes('PAMPLONA')) {
          const cheapestTwo = [...pendingServices, standard].sort((a, b) => a - b).slice(0, 2);
          quote = 100_000 + cheapestTwo.reduce((total, value) => total + Math.max(0, value - 25_000), 0);
        } else if (['CHINACOTA', 'DURANIA', 'BOCHALEMA'].some((place) => nextLugarId.includes(place))) {
          quote = 50_000 + 20_000 * (pendingServices.length + 1);
        } else {
          throw new Error('No hay una tarifa disponible sin conexión para este destino y transporte.');
        }
      }
      if (requestId === quoteRequestId.current) setTransferQuote(quote);
    } catch (err) {
      if (requestId === quoteRequestId.current) {
        setError(err instanceof Error ? err.message : 'No se pudo calcular el precio del traslado.');
      }
    } finally {
      if (requestId === quoteRequestId.current) setQuoteLoading(false);
    }
  };

  const limpiar = () => {
    setPaso({ kind: 'servicio' });
    setNumeroOrden('');
    setMarcaSeleccionada('SAMSUNG');
    setTipoId('');
    setDescripcion('');
    setDesmontoPuertas(false);
    setPuertasDesmontadas(0);
    setRequiereAyudante(false);
    setMotivoAyudante('');
    setTransportType('MOTO_PROPIA');
    setLugarId('');
    setError('');
    setActiveValidation(false);
    quoteRequestId.current++;
    setTransferQuote(null);
    setQuoteLoading(false);
    setFieldErrors({});
    setFotosPuertas([]);
    setFotosAyudante([]);
  };

  const handleCancelar = async () => {
    if (saving) return;
    if (paso.kind !== 'traslado') {
      if (paso.kind === 'servicio' && user?.id && draftReady) {
        const hasContent = Boolean(
          numeroOrden || tipoId || descripcion || desmontoPuertas || requiereAyudante ||
          fotosPuertas.length || fotosAyudante.length,
        );
        try {
          if (hasContent) {
            await saveServiceDraft(user.id, {
              numeroOrden,
              marcaSeleccionada,
              tipoId,
              descripcion,
              desmontoPuertas,
              puertasDesmontadas,
              requiereAyudante,
              motivoAyudante,
              fotosPuertas,
              fotosAyudante,
            });
          } else {
            await clearServiceDraft(user.id);
          }
        } catch (err) {
          setError(err instanceof Error ? `No se pudo guardar el borrador: ${err.message}` : 'No se pudo guardar el borrador.');
          return;
        }
      }
      onClose();
      return;
    }
    setSaving(true);
    setError('');
    if (!window.confirm('Esta orden ya se guardó parcialmente. Si sales ahora, se eliminará para evitar un registro incompleto. ¿Continuar?')) {
      setSaving(false);
      return;
    }
    onDeleteService(paso.servicioId).then(async () => {
      if (user?.id) await clearServiceDraft(user.id);
      limpiar();
      onClose();
    }).catch((err) => {
      setError(err instanceof Error
        ? `No se pudo cancelar la orden incompleta: ${err.message}`
        : 'No se pudo cancelar la orden incompleta. Inténtalo de nuevo.');
    }).finally(() => setSaving(false));
  };

  const handleReadOrderPhoto = async (file?: File) => {
    if (!file) return;
    setOcrLoading(true);
    setOcrMessage('Leyendo el número en este dispositivo…');
    setError('');
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      try {
        await worker.setParameters({ tessedit_char_whitelist: '0123456789' });
        const { data } = await worker.recognize(file);
        const matches = data.text.match(/(?<!\d)\d{5}(?!\d)/g) ?? [];
        const uniqueMatches = [...new Set(matches)];
        if (uniqueMatches.length === 1) {
          setNumeroOrden(uniqueMatches[0]);
          setFieldErrors((current) => ({ ...current, order: '' }));
          setOcrMessage(`Número detectado: ${uniqueMatches[0]}. Verifícalo antes de continuar.`);
        } else if (uniqueMatches.length > 1) {
          setOcrMessage(`Se encontraron varios números (${uniqueMatches.join(', ')}). Escríbelo manualmente.`);
        } else {
          setOcrMessage('No se detectó un número de 5 dígitos. Puedes escribirlo manualmente.');
        }
      } finally {
        await worker.terminate();
      }
    } catch (err) {
      setOcrMessage('');
      setError(err instanceof Error ? `No se pudo leer la imagen: ${err.message}` : 'No se pudo leer la imagen.');
    } finally {
      setOcrLoading(false);
    }
  };

  const validarOrden = (valor: string) => {
    const digits = valor.replace(/^(T-)?(BUC|CUC)-/i, '').trim();
    if (!/^\d{5}$/.test(digits)) {
      return 'El número de orden debe contener exactamente 5 dígitos numéricos.';
    }
    if (existingOrders.includes(digits)) return `La orden ${digits} ya está en esta cuenta.`;
    return '';
  };

  const cargarFotos = async (
    files: FileList | null,
    setPhotos: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (!files) return;
    const seleccion = Array.from(files);
    if (fotosPuertas.length + fotosAyudante.length + seleccion.length > 10) {
      setError('Puedes adjuntar hasta 10 fotos por orden.');
      return;
    }
    for (const file of seleccion) {
      if (file.size > 50 * 1024 * 1024) {
        setError('Cada foto puede pesar hasta 50 MB antes de optimizarla.');
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Usa imágenes JPG, PNG o WebP.');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const dataUrls: string[] = [];
      for (const file of seleccion) dataUrls.push(await compressPhoto(file));
      setPhotos((actuales) => [...actuales, ...dataUrls]);
    } finally {
      setSaving(false);
    }
  };

  const handleSiguienteServicio = async () => {
    setActiveValidation(true);
    setError('');

    const ordenError = validarOrden(numeroOrden);
    if (ordenError) {
    setFieldErrors((current) => ({ ...current, order: ordenError }));
    setError(ordenError);
      return;
    }

    if (!tipoId) {
      setFieldErrors((current) => ({ ...current, type: 'Selecciona un tipo de servicio.' }));
      setError('Selecciona un tipo de servicio.');
      return;
    }

    if (!descripcion.trim()) {
      setFieldErrors((current) => ({ ...current, description: 'La descripción es obligatoria.' }));
      setError('La descripción es obligatoria.');
      return;
    }

    if (requiereFotoPuertas && (!Number.isInteger(puertasDesmontadas) || puertasDesmontadas < 1 || puertasDesmontadas > 4)) {
      setError('Escribe una cantidad de puertas entre 1 y 4.');
      return;
    }
    if (requiereFotoPuertas && fotosPuertas.length === 0) {
      setError('Sube al menos una foto del retiro de puertas.');
      return;
    }
    if (requiereFotoAyudante && fotosAyudante.length === 0) {
      setError('Sube una foto que muestre el motivo por el que necesitaste ayudante.');
      return;
    }
    if (requiereAyudante && !motivoAyudante.trim()) {
      setError('Escribe por qué necesitaste ayudante.');
      return;
    }

    setSaving(true);
    try {
      const cleanDigits = numeroOrden.replace(/^(T-)?(BUC|CUC)-/i, '').trim();
      const servicio = await onCreateService({
        tipo_servicio_id: tipoId,
        numero_orden: cleanDigits,
        descripcion_especifica: descripcion.trim(),
        fotos_puertas: fotosPuertas,
        fotos_ayudante: fotosAyudante,
        ...(esRecogidaNevecon ? { puertas_desmontadas: puertasDesmontadas } : {}),
        ...(esRecoleccionConAyudanteOpcional ? { requiere_ayudante: requiereAyudante } : {}),
        ...(requiereAyudante ? { motivo_ayudante: motivoAyudante.trim() } : {}),
      });
      const tipo = types.find((t) => t.id === tipoId);
      if (tipo && !requiereTraslado(tipo.nombre)) {
        setDraftReady(false);
        if (user?.id) {
          await clearServiceDraft(user.id);
        }
        onClose();
        limpiar();
        return;
      }

      setPaso({
        kind: 'traslado',
        servicioId: servicio.id,
        tipoId,
        tipoNombre: tipo?.nombre ?? '',
        valorBase: tipo ? Number(tipo.valor_estandar) : 0,
        valorServicio: Number(servicio.valor_cobrado),
        puertasDesmontadas,
        requiereAyudante: esRecoleccionConAyudanteOpcional && requiereAyudante,
        numeroOrden: cleanDigits,
      });
      setDraftReady(false);
      if (user?.id) {
        clearServiceDraft(user.id).catch((err) => {
          setError(err instanceof Error ? `La orden se guardó, pero no se pudo borrar el borrador local: ${err.message}` : 'La orden se guardó, pero no se pudo borrar el borrador local.');
        });
      }
    } catch (err) {
      if (err instanceof QueuedOfflineError) {
        try {
          if (user?.id) await clearServiceDraft(user.id);
        } catch (clearError) {
          setError(`La orden quedó en cola, pero no se pudo borrar el borrador local: ${clearError instanceof Error ? clearError.message : 'error de almacenamiento'}.`);
          return;
        }
        limpiar();
        onClose();
        return;
      }
      setError(err instanceof Error ? err.message : 'No se pudo guardar el servicio.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizarSinTraslado = async () => {
    setSaving(true);
    setError('');
    try {
      if (user?.id) await clearServiceDraft(user.id);
      onClose();
      limpiar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo finalizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleSiguienteTraslado = async () => {
    if (!lugarId) {
      setError('Selecciona un lugar de traslado.');
      return;
    }
    if (transferQuote === null || quoteLoading) {
      setError('Espera a que se calcule la tarifa del traslado.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const lugar = lugares.find((l) => l.id === lugarId);
      const tipoTrasladoDb = types.find((t) => t.nombre.toLowerCase() === lugar?.dbNombre.toLowerCase()) ||
        types.find((t) => t.nombre.toLowerCase().includes(lugar?.nombre.toLowerCase() ?? ''));

      if (!tipoTrasladoDb) {
        throw new Error(`Tarifa de traslado no reconocida en catálogo para "${lugar?.nombre}".`);
      }

      const descripcionTraslado = `${tipoVehiculoLabel[transportType]} — ${lugar?.nombre ?? ''}`;
      const prev = paso as Extract<typeof paso, { kind: 'traslado' }>;

      const trasladoResp = await onCreateTransfer({
        tipo_servicio_id: tipoTrasladoDb.id,
        numero_orden: prev.numeroOrden,
        descripcion_especifica: descripcionTraslado,
        destino: lugarId,
        transporte: transportType === 'MOTO_PROPIA' ? 'MOTO_PROPIA' : 'VEHICULO_EMPRESA',
        valor_cobrado: transferQuote,
      });

      const traslado = typeof trasladoResp === 'object' && 'servicio' in trasladoResp
        ? (trasladoResp.servicio as ServiceApi)
        : (trasladoResp as ServiceApi);

      const valorRegistrado = typeof trasladoResp === 'object' && 'valor_cobrado' in trasladoResp
        ? Number(trasladoResp.valor_cobrado)
        : Number(traslado.valor_cobrado);

      setPaso({
        kind: 'final',
        servicioId: prev.servicioId,
        tipoNombre: prev.tipoNombre,
        valorBase: prev.valorBase,
        valorServicio: prev.valorServicio,
        puertasDesmontadas: prev.puertasDesmontadas,
        requiereAyudante: prev.requiereAyudante,
        trasladoId: traslado.id,
        trasladoNombre: `${lugar?.nombre} (${tipoVehiculoLabel[transportType]})`,
        trasladoValor: valorRegistrado,
        numeroOrden: prev.numeroOrden,
      });
    } catch (err) {
      if (err instanceof QueuedOfflineError) {
        limpiar();
        onClose();
        return;
      }
      setError(err instanceof Error ? err.message : 'No se pudo registrar el traslado.');
    } finally {
      setSaving(false);
    }
  };

  // Render del Ticket de Compra para el técnico (solo muestra el número de orden limpio)
  const renderTicket = (items: { label: string; sub?: string; valor: number }[], total: number) => {
    const ordenLimpia = numeroOrden.replace(/^(T-)?(BUC|CUC)-/i, '').trim();

    return (
      <div style={ticketContainerStyle}>
        <div style={ticketHeaderStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Receipt size={16} style={{ color: 'var(--blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Ticket de la Orden
            </span>
          </div>
          <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--ink)' }}>
            {ordenLimpia ? `Orden: ${ordenLimpia}` : 'Orden: ———'}
          </span>
        </div>

        <div style={ticketBodyStyle}>
          {items.map((it, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '14px', gap: '8px', padding: '9px 10px', borderRadius: 9, background: /puerta|ayudante|adicional/i.test(it.label) ? '#e0edff' : 'white', border: '1px solid #dbe5f0' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: '700', color: 'var(--ink)' }}>{it.label}</div>
                {it.sub && <div style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>{it.sub}</div>}
              </div>
              <span style={{ fontWeight: '800', color: '#073d78', whiteSpace: 'nowrap' }}>
                {formatCOP(it.valor)}
              </span>
            </div>
          ))}
        </div>

        <div style={ticketTotalStyle}>
          <span style={{ fontWeight: '800', fontSize: '14px', color: 'var(--ink)' }}>Subtotal de la orden</span>
          <span style={{ fontWeight: '800', fontSize: '18px', color: 'var(--blue)' }}>{formatCOP(total)}</span>
        </div>
      </div>
    );
  };

  const renderPaso = () => {
    switch (paso.kind) {
      case 'servicio': {
        const ticketItems = tipoActual
          ? [
              { label: tipoActual.nombre, sub: 'Servicio técnico', valor: tipoValor },
              ...(costoPuertas > 0 ? [{ label: `Desmonte de puertas (${puertasDesmontadas})`, sub: '$10.000 por puerta', valor: costoPuertas }] : []),
              ...(costoAyudante > 0 ? [{ label: 'Servicio con ayudante', sub: 'Adicional por apoyo', valor: costoAyudante }] : []),
            ]
          : [];

        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  Paso 1 · Servicio Técnico
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Registra el número de orden y selecciona la marca del equipo.
                </p>
              </div>
              <button type="button" onClick={handleCancelar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', lineHeight: 1, padding: '4px' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Número de orden</label>
                <input
                  ref={orderPhotoInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    void handleReadOrderPhoto(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => orderPhotoInput.current?.click()}
                  disabled={ocrLoading}
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #bfdbfe', borderRadius: 9, background: '#eff6ff', color: '#1d4ed8', padding: '8px 11px', fontSize: 12, fontWeight: 700, cursor: ocrLoading ? 'wait' : 'pointer' }}
                >
                  <ScanLine size={15} />
                  {ocrLoading ? 'Leyendo imagen…' : 'Leer orden desde una foto'}
                </button>
                <p style={{ margin: 0, color: '#64748b', fontSize: 11 }}>El análisis se realiza en este dispositivo; la foto no se envía al servidor. La primera vez puede descargar el motor de lectura.</p>
                {ocrMessage && <p role="status" style={{ margin: 0, color: '#1d4ed8', fontSize: 12 }}>{ocrMessage}</p>}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="Ej: 10452"
                  value={numeroOrden.replace(/^(T-)?(BUC|CUC)-/i, '')}
                  onChange={(e) => {
                    const onlyNums = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setNumeroOrden(onlyNums);
                    if (activeValidation) setError('');
                    setFieldErrors((current) => ({ ...current, order: '' }));
                  }}
                  onBlur={() => {
                    const validation = validarOrden(numeroOrden);
                    setFieldErrors((current) => ({ ...current, order: validation }));
                  }}
                  aria-invalid={!!fieldErrors.order}
                  style={inputStyle}
                />
                {fieldErrors.order ? <p role="alert" style={fieldErrorStyle}>{fieldErrors.order}</p> : <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Ingresa exactamente 5 dígitos numéricos.
                </p>}
                {recentOrders.length > 0 && (
                  <div style={{ marginTop: 5 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: '#475569' }}>Órdenes recientes para consultar</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {recentOrders.slice(0, 8).map((order) => <span key={order} style={recentOrderStyle}>{order}</span>)}
                    </div>
                  </div>
                )}
              </div>

              {/* Selector de Marca */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Marca del equipo</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                  {marcasDisponibles.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMarcaSeleccionada(m);
                        setTipoId('');
                      }}
                      style={{
                        padding: '10px 4px',
                        borderRadius: '10px',
                        border: marcaSeleccionada === m ? '2px solid var(--blue)' : '1px solid rgba(0,0,0,0.12)',
                        background: marcaSeleccionada === m ? 'rgba(0,87,184,0.06)' : 'white',
                        color: marcaSeleccionada === m ? 'var(--blue)' : 'var(--ink)',
                        fontWeight: marcaSeleccionada === m ? '700' : '500',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        textTransform: 'uppercase',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selector de Tipo de Servicio filtrado */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Tipo de servicio ({marcaSeleccionada})
                </label>
                <select
                  value={tipoId}
                  onChange={(e) => {
                    setTipoId(e.target.value);
                    const selectedType = types.find((type) => type.id === e.target.value);
                    const normalizedName = selectedType?.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() ?? '';
                    const selectedIsCollection = /recoleccion|recogida/.test(normalizedName);
                    const selectedIncludesHelper = selectedIsCollection && normalizedName.includes('incluye ayudante');
                    const selectedIsNevecon = selectedIsCollection && normalizedName.includes('nevecon');
                    if (!selectedIsCollection || selectedIncludesHelper) {
                      setRequiereAyudante(false);
                      setFotosAyudante([]);
                    }
                    if (!selectedIsNevecon) {
                      setDesmontoPuertas(false);
                      setPuertasDesmontadas(0);
                      setFotosPuertas([]);
                    }
                    if (activeValidation) setError('');
                    setFieldErrors((current) => ({ ...current, type: '' }));
                  }}
                  onBlur={() => setFieldErrors((current) => ({ ...current, type: tipoId ? '' : 'Selecciona un tipo de servicio.' }))}
                  aria-invalid={!!fieldErrors.type}
                  style={inputStyle}
                  disabled={tiposFiltradosPorMarca.length === 0}
                >
                  <option value="">
                    {tiposFiltradosPorMarca.length === 0 ? 'Sin servicios registrados para esta marca' : 'Selecciona un tipo de servicio...'}
                  </option>
                  {tiposFiltradosPorMarca.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre.replace(new RegExp(`^${marcaSeleccionada}:\\s*`, 'i'), '')}
                    </option>
                  ))}
                </select>
                {fieldErrors.type && <p role="alert" style={fieldErrorStyle}>{fieldErrors.type}</p>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Descripción del trabajo</label>
                <textarea
                  placeholder="Qué hiciste, componentes cambiados, resultado..."
                  rows={3}
                  value={descripcion}
                  onChange={(e) => {
                    setDescripcion(e.target.value);
                    if (activeValidation) setError('');
                    setFieldErrors((current) => ({ ...current, description: '' }));
                  }}
                  onBlur={() => {
                    setFieldErrors((current) => ({ ...current, description: descripcion.trim() ? '' : 'La descripción es obligatoria.' }));
                  }}
                  aria-invalid={!!fieldErrors.description}
                  style={inputStyle}
                />
                {fieldErrors.description && <p role="alert" style={fieldErrorStyle}>{fieldErrors.description}</p>}
              </div>

              {esRecogidaNevecon && (
                <fieldset style={{ margin: 0, padding: 14, borderRadius: 12, border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                  <legend style={{ padding: '0 6px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Recogida de nevecon</legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label htmlFor="doors-removed" style={checkboxLabelStyle}>¿Desmontaste puertas?</label>
                    <select
                      id="doors-removed"
                      value={desmontoPuertas ? 'si' : 'no'}
                      onChange={(event) => {
                        const desmontadas = event.target.value === 'si';
                        setDesmontoPuertas(desmontadas);
                        setPuertasDesmontadas(desmontadas ? Math.max(puertasDesmontadas, 1) : 0);
                        if (!desmontadas) setFotosPuertas([]);
                      }}
                      style={inputStyle}
                    >
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                    {desmontoPuertas && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label htmlFor="door-count" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Cantidad de puertas desmontadas (1 a 4)</label>
                        <input
                          id="door-count"
                          type="text"
                          inputMode="numeric"
                          pattern="[1-4]"
                          maxLength={1}
                          placeholder="Escribe de 1 a 4"
                          value={puertasDesmontadas || ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === '') {
                              setPuertasDesmontadas(0);
                              return;
                            }
                            if (/^[1-4]$/.test(value)) {
                              setPuertasDesmontadas(Number(value));
                            }
                          }}
                          aria-invalid={desmontoPuertas && !cantidadPuertasValida}
                          style={inputStyle}
                        />
                        {desmontoPuertas && !cantidadPuertasValida && (
                          <p role="alert" style={fieldErrorStyle}>Escribe un número entero de 1 a 4.</p>
                        )}
                        <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
                          {puertasDesmontadas > 0 ? `${formatCOP(puertasDesmontadas * 10_000)} adicionales` : 'El adicional es de $10.000 por puerta.'}
                        </p>
                      </div>
                    )}
                  </div>
                </fieldset>
              )}

              {esRecoleccionConAyudanteOpcional && (
                <fieldset style={{ margin: 0, padding: 14, borderRadius: 12, border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                  <legend style={{ padding: '0 6px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Apoyo para la recolección</legend>
                  <label htmlFor="helper-required" style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>¿Tuviste ayudante?</label>
                  <select
                    id="helper-required"
                    value={requiereAyudante ? 'si' : 'no'}
                    onChange={(event) => {
                      const needed = event.target.value === 'si';
                      setRequiereAyudante(needed);
                      if (!needed) {
                        setFotosAyudante([]);
                        setMotivoAyudante('');
                      }
                    }}
                    style={inputStyle}
                  >
                    <option value="no">No</option>
                    <option value="si">Sí · adicional de {formatCOP(10_000)}</option>
                  </select>
                  {requiereAyudante && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
                      <label htmlFor="helper-reason" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        ¿Por qué necesitaste ayudante?
                      </label>
                      <textarea
                        id="helper-reason"
                        rows={2}
                        maxLength={300}
                        placeholder="Ej.: el equipo era muy pesado para moverlo solo."
                        value={motivoAyudante}
                        onChange={(event) => setMotivoAyudante(event.target.value)}
                        style={{ ...inputStyle, resize: 'vertical' }}
                        required
                      />
                      <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Describe brevemente el motivo (máximo 300 caracteres).</p>
                    </div>
                  )}
                </fieldset>
              )}

              {requiereFotoPuertas && (
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <label htmlFor="door-photos" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                      Fotos del desmonte (obligatorias)
                    </label>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{fotosPuertas.length}/10</span>
                  </div>
                  <input
                    ref={puertasPhotoInput}
                    id="door-photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => {
                      void cargarFotos(event.target.files, setFotosPuertas).catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las fotos.'));
                      event.target.value = '';
                    }}
                    style={{ display: 'none' }}
                  />
                  <button type="button" onClick={() => puertasPhotoInput.current?.click()} disabled={saving || fotosPuertas.length + fotosAyudante.length >= 10} style={photoAddStyle}>
                      {saving ? 'Optimizando fotos…' : '+ Agregar fotos'}
                  </button>
                  <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: 11 }}>
                    Sube al menos una foto que muestre las puertas desmontadas. Se aceptan fotos de hasta 50 MB y se optimizan antes de guardarlas.
                  </p>
                  {fotosPuertas.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
                      {fotosPuertas.map((foto, index) => (
                        <div key={`${index}-${foto.slice(-12)}`} style={{ position: 'relative' }}>
                          <img src={foto} alt={`Foto de puertas desmontadas ${index + 1}`} style={{ width: 66, height: 66, objectFit: 'cover', borderRadius: 9, border: '1px solid #cbd5e1' }} />
                          <button type="button" onClick={() => setFotosPuertas((actuales) => actuales.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar foto de puertas ${index + 1}`} style={photoDeleteStyle}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {requiereFotoAyudante && (
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <label htmlFor="helper-photos" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Foto del motivo del ayudante (obligatoria)</label>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{fotosAyudante.length}/10</span>
                  </div>
                  <input
                    ref={ayudantePhotoInput}
                    id="helper-photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(event) => {
                      void cargarFotos(event.target.files, setFotosAyudante).catch((err) => setError(err instanceof Error ? err.message : 'No se pudieron cargar las fotos.'));
                      event.target.value = '';
                    }}
                    style={{ display: 'none' }}
                  />
                  <button type="button" onClick={() => ayudantePhotoInput.current?.click()} disabled={saving || fotosPuertas.length + fotosAyudante.length >= 10} style={photoAddStyle}>
                    {saving ? 'Optimizando fotos…' : '+ Agregar evidencia del ayudante'}
                  </button>
                  <p style={{ margin: '7px 0 0', color: '#64748b', fontSize: 11 }}>Sube al menos una foto que evidencie por qué fue necesario el apoyo. Se aceptan fotos de hasta 50 MB y se optimizan antes de guardarlas.</p>
                  {fotosAyudante.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
                      {fotosAyudante.map((foto, index) => (
                        <div key={`${index}-${foto.slice(-12)}`} style={{ position: 'relative' }}>
                          <img src={foto} alt={`Evidencia del ayudante ${index + 1}`} style={{ width: 66, height: 66, objectFit: 'cover', borderRadius: 9, border: '1px solid #cbd5e1' }} />
                          <button type="button" onClick={() => setFotosAyudante((actuales) => actuales.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Eliminar evidencia del ayudante ${index + 1}`} style={photoDeleteStyle}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Ticket de cuenta en tiempo real */}
              {renderTicket(ticketItems, tipoValor + totalAdicionales)}

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', backgroundColor: 'rgba(211,47,47,0.08)', border: '1px solid rgba(211,47,47,0.3)', color: '#b3261e', fontSize: '13px', fontWeight: '500' }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" onClick={handleCancelar} style={{ flex: 1, padding: '12px', borderRadius: '11px', border: '1px solid rgba(0,0,0,0.12)', background: 'white', color: 'var(--ink)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                  Guardar borrador y salir
                </button>
                <button type="button" onClick={handleSiguienteServicio} disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: '11px', border: 'none', background: saving ? 'var(--text-secondary)' : 'var(--blue)', color: 'white', fontWeight: '600', fontSize: '14px', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Guardando servicio…' : 'Continuar a traslado'}
                </button>
              </div>
            </div>
          </>
        );
      }

      case 'traslado': {
        const prev = paso as Extract<typeof paso, { kind: 'traslado' }>;
        const items = [
          { label: prev.tipoNombre, sub: 'Servicio base', valor: prev.valorBase },
        ];
        if (prev.puertasDesmontadas > 0) {
          items.push({
            label: `Desmonte de puertas (${prev.puertasDesmontadas})`,
            sub: '$10.000 por puerta',
            valor: prev.puertasDesmontadas * 10_000,
          });
        }
        if (prev.requiereAyudante) {
          items.push({
            label: 'Servicio con ayudante',
            sub: 'Adicional por apoyo',
            valor: 10_000,
          });
        }
        if (lugarSeleccionado) {
          items.push({
            label: `Traslado a ${lugarSeleccionado.nombre}`,
            sub: tipoVehiculoLabel[transportType],
            valor: trasladoCalculado,
          });
        }

        const totalConTraslado = prev.valorServicio + trasladoCalculado;

        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  Paso 2 · ¿Hubo traslado?
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  ¿Requirió traslado fuera del taller para atender la orden <strong style={{ color: 'var(--ink)' }}>{prev.numeroOrden}</strong>?
                </p>
              </div>
              <button type="button" onClick={handleCancelar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', lineHeight: 1, padding: '4px' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleFinalizarSinTraslado}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: '11px',
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: 'white',
                    color: 'var(--ink)',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Check size={16} />
                  No hubo traslado (Finalizar orden)
                </button>
              </div>

              <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)' }}>
                  Sí hubo traslado:
                </span>
              </div>

              <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', padding: 0, margin: 0 }}>
                  Medio de transporte
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setTransportType('MOTO_PROPIA');
                      void cotizarTraslado(lugarId, 'MOTO_PROPIA');
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '11px',
                      border: transportType === 'MOTO_PROPIA' ? '2px solid var(--blue)' : '1px solid rgba(0,0,0,0.12)',
                      background: transportType === 'MOTO_PROPIA' ? 'rgba(0,87,184,0.06)' : 'white',
                      color: transportType === 'MOTO_PROPIA' ? 'var(--blue)' : 'var(--ink)',
                      fontWeight: transportType === 'MOTO_PROPIA' ? '700' : '500',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <User size={15} />
                    Moto propia
                  </button>
                  {user?.sede !== 'Bucaramanga' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTransportType('EMPRESA');
                        void cotizarTraslado(lugarId, 'EMPRESA');
                      }}
                      style={{
                        padding: '12px',
                        borderRadius: '11px',
                        border: transportType === 'EMPRESA' ? '2px solid var(--blue)' : '1px solid rgba(0,0,0,0.12)',
                        background: transportType === 'EMPRESA' ? 'rgba(0,87,184,0.06)' : 'white',
                        color: transportType === 'EMPRESA' ? 'var(--blue)' : 'var(--ink)',
                        fontWeight: transportType === 'EMPRESA' ? '700' : '500',
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <Truck size={15} />
                      Vehículo empresa
                    </button>
                  )}
                </div>
              </fieldset>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Lugar de traslado</label>
                <select
                  value={lugarId}
                  onChange={(e) => {
                    setLugarId(e.target.value);
                    setFieldErrors((current) => ({ ...current, destination: '' }));
                    void cotizarTraslado(e.target.value, transportType);
                  }}
                  onBlur={() => setFieldErrors((current) => ({ ...current, destination: lugarId ? '' : 'Selecciona un lugar de traslado.' }))}
                  aria-invalid={!!fieldErrors.destination}
                  style={inputStyle}
                >
                  <option value="">Selecciona el destino...</option>
                  {lugares.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
                {fieldErrors.destination && <p role="alert" style={fieldErrorStyle}>{fieldErrors.destination}</p>}
              </div>

              {/* Ticket con cálculo en tiempo real */}
              {renderTicket(items, totalConTraslado)}
              {quoteLoading && <p role="status" style={{ margin: 0, color: '#475569', fontSize: 12 }}>Calculando tarifa exacta del traslado…</p>}

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', backgroundColor: 'rgba(211,47,47,0.08)', border: '1px solid rgba(211,47,47,0.3)', color: '#b3261e', fontSize: '13px', fontWeight: '500' }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={handleSiguienteTraslado}
                  disabled={saving || !lugarId || quoteLoading || transferQuote === null}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '11px',
                    border: 'none',
                    background: saving || !lugarId || quoteLoading || transferQuote === null ? 'var(--text-secondary)' : 'var(--blue)',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: saving || !lugarId || quoteLoading || transferQuote === null ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Guardando traslado…' : quoteLoading ? 'Calculando tarifa…' : 'Guardar traslado y finalizar orden'}
                </button>
              </div>
            </div>
          </>
        );
      }

      case 'final': {
        const fin = paso as Extract<typeof paso, { kind: 'final' }>;
        const total = fin.valorServicio + fin.trasladoValor;
        const finalItems = [
          { label: fin.tipoNombre, sub: 'Servicio base', valor: fin.valorBase },
          ...(fin.puertasDesmontadas > 0 ? [{ label: `Desmonte de puertas (${fin.puertasDesmontadas})`, sub: '$10.000 por puerta', valor: fin.puertasDesmontadas * 10_000 }] : []),
          ...(fin.requiereAyudante ? [{ label: 'Servicio con ayudante', sub: 'Adicional por apoyo', valor: 10_000 }] : []),
          { label: fin.trasladoNombre, sub: 'Traslado incluido', valor: fin.trasladoValor },
        ];

        return (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  ¡Orden Registrada!
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  La orden {fin.numeroOrden} ha sido agregada con éxito a tu cuenta.
                </p>
              </div>
              <button type="button" onClick={handleCancelar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '18px', lineHeight: 1, padding: '4px' }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {renderTicket(finalItems, total)}

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '12px', background: '#e6f4ea', border: '1px solid #ceead6', color: '#137333', fontSize: '13px', fontWeight: '500' }}>
                <Check size={18} style={{ flexShrink: 0 }} />
                <span>Servicio y traslado guardados y totalizados en tu cuenta.</span>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    limpiar();
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '11px',
                    border: 'none',
                    background: 'var(--blue)',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Finalizar y ver en mi cuenta
                </button>
              </div>
            </div>
          </>
        );
      }
    }
  };

  return (
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      {/* Fondo sin onClick para que NO se cierre al dar click por fuera */}
      <div style={backdropStyle} />
      <div style={modalStyle}>
        <div style={bodyStyle}>
          {renderPaso()}
        </div>
      </div>
    </div>
  );
};

export async function compressPhoto(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  try {
    const targetBytes = 700 * 1024;
    let scale = Math.min(1, 1920 / Math.max(image.width, image.height));
    let quality = 0.86;
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo optimizar una de las fotos.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= targetBytes) break;
      if (quality > 0.5) quality = Math.max(0.5, quality - 0.08);
      else {
        scale *= 0.8;
        quality = 0.78;
      }
    }
    if (!blob || blob.size > targetBytes) throw new Error('No se pudo reducir esta foto al tamaño permitido. Prueba con otra imagen.');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer una de las fotos.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    image.close();
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid rgba(0,0,0,0.15)',
  background: 'white',
  color: 'var(--ink)',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
};

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.45)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
  zIndex: 1,
};

const modalStyle: React.CSSProperties = {
  position: 'relative',
  zIndex: 2,
  width: '100%',
  maxWidth: '520px',
  background: 'white',
  borderRadius: '20px',
  boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
  maxHeight: '90vh',
  overflowY: 'auto',
};

const bodyStyle: React.CSSProperties = {
  padding: '28px',
};

// Estilos del Ticket de compra
const ticketContainerStyle: React.CSSProperties = {
  backgroundColor: '#edf4fc',
  border: '1px solid #9db8d8',
  borderRadius: '14px',
  padding: '16px',
};

const ticketHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: '10px',
  borderBottom: '1px solid #b6c8dc',
  marginBottom: '12px',
};

const ticketBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  paddingBottom: '12px',
};

const ticketTotalStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingTop: '10px',
  borderTop: '2px solid #7189a6',
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  color: 'var(--ink)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
const fieldErrorStyle: React.CSSProperties = { margin: '2px 0 0', fontSize: 12, color: '#b42318', fontWeight: 600 };
const recentOrderStyle: React.CSSProperties = { padding: '4px 8px', borderRadius: 6, background: '#e2e8f0', color: '#334155', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
const photoAddStyle: React.CSSProperties = { padding: '8px 11px', borderRadius: 8, border: '1px solid #94a3b8', background: 'white', color: '#1e3a5f', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const photoDeleteStyle: React.CSSProperties = { position: 'absolute', top: -6, right: -6, width: 21, height: 21, borderRadius: '50%', border: '1px solid white', background: '#b42318', color: 'white', fontSize: 16, lineHeight: 1, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 5px rgba(0,0,0,.25)' };
