import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { technicianApi, type ServiceApi } from '../services/technicianApi';
import { formatCOP } from '../lib/period';
import { AlertCircle, ArrowRight, Check, Receipt, Truck, User } from 'lucide-react';

type TransportType = 'MOTO_PROPIA' | 'EMPRESA';
type MarcaOption = 'SAMSUNG' | 'HISENSE' | 'HYUNDAI' | 'TCL' | 'ZURICH';

type Paso =
  | { kind: 'servicio' }
  | { kind: 'traslado'; servicioId: string; tipoId: string; tipoNombre: string; tipoValor: number; numeroOrden: string }
  | { kind: 'final'; servicioId: string; tipoNombre: string; tipoValor: number; trasladoId: string; trasladoNombre: string; trasladoValor: number; numeroOrden: string }
  | { kind: 'error'; message: string };

export interface TipoServicioOption {
  id: string;
  nombre: string;
  valor_estandar: number;
}

// Catálogo de destinos por sede y su tarifa fija directa
const lugaresBucaramanga = [
  { id: 'PIEDECUESA', nombre: 'Piedecuesta', valor: 6000, dbNombre: 'TRASLADO: Piedecuesta' },
  { id: 'GIRON', nombre: 'Girón', valor: 3000, dbNombre: 'TRASLADO: Giron' },
  { id: 'LEBRIJA', nombre: 'Lebrija', valor: 8000, dbNombre: 'TRASLADO: Lebrija' },
  { id: 'LOS_SANTOS', nombre: 'Los Santos', valor: 25000, dbNombre: 'TRASLADO: Los Santos' },
  { id: 'RIONEGRO_PLAYON', nombre: 'Rionegro / Playón', valor: 30000, dbNombre: 'TRASLADO: Rionegro-Playon' },
  { id: 'PESCADERO', nombre: 'Pescadero', valor: 25000, dbNombre: 'TRASLADO: Pescadero' },
  { id: 'ZAPATOCA', nombre: 'Zapatoca', valor: 60000, dbNombre: 'TRASLADO: Zapatoca' },
  { id: 'CUARESMA', nombre: 'Cuaresma', valor: 12000, dbNombre: 'TRASLADO: Curos' },
  { id: 'SOGAMOSO', nombre: 'Sogamoso', valor: 35000, dbNombre: 'TRASLADO: Sogamoso' },
  { id: 'MATANZA', nombre: 'Matanza', valor: 25000, dbNombre: 'TRASLADO: Matanza' },
  { id: 'ACAPULCO', nombre: 'Acapulco', valor: 9000, dbNombre: 'TRASLADO: Acapulco' },
  { id: 'SAN_VICENTE', nombre: 'San Vicente', valor: 75000, dbNombre: 'TRASLADO: San Vicente' },
] as const;

const lugaresCucuta = [
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

export const RegistroFlujoModal = ({
  open,
  onClose,
  onCreateService,
  onCreateTransfer,
  types,
}: {
  open: boolean;
  onClose: () => void;
  onCreateService: (payload: { tipo_servicio_id: string; numero_orden: string; descripcion_especifica: string }) => Promise<ServiceApi>;
  onCreateTransfer: (payload: { tipo_servicio_id: string; numero_orden: string; descripcion_especifica: string; destino: string; transporte: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA' }) => Promise<{ servicio: ServiceApi; valor_cobrado: number }>;
  types: TipoServicioOption[];
}) => {
  const { user } = useAuth();
  const sede = (user?.sede ?? 'Bucaramanga').toLowerCase().includes('cuc') ? 'Cúcuta' : 'Bucaramanga';

  const [paso, setPaso] = useState<Paso>({ kind: 'servicio' });
  const [numeroOrden, setNumeroOrden] = useState('');
  const [marcaSeleccionada, setMarcaSeleccionada] = useState<MarcaOption>('SAMSUNG');
  const [tipoId, setTipoId] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [transportType, setTransportType] = useState<TransportType>('MOTO_PROPIA');
  const [lugarId, setLugarId] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeValidation, setActiveValidation] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  // Filtrar tipos de servicio según la marca seleccionada
  const tiposFiltradosPorMarca = types.filter((t) => {
    if (t.nombre.startsWith('TRASLADO')) return false;
    return t.nombre.toUpperCase().startsWith(`${marcaSeleccionada}:`);
  });

  const lugares = sede === 'Cúcuta' ? lugaresCucuta : lugaresBucaramanga;

  const tipoActual = types.find((t) => t.id === tipoId) ?? null;
  const tipoValor = tipoActual ? Number(tipoActual.valor_estandar) : 0;

  const lugarSeleccionado = lugares.find((l) => l.id === lugarId) ?? null;

  // Cálculo en tiempo real de la tarifa del traslado cuando el técnico selecciona
  const calcularTrasladoEnVivo = (): number => {
    if (!lugarSeleccionado) return 0;
    if (transportType === 'MOTO_PROPIA') {
      if (sede === 'Cúcuta') {
        return lugarSeleccionado.valor + tipoValor;
      }
      return lugarSeleccionado.valor;
    } else {
      // Vehículo empresa (Cúcuta)
      const dest = lugarSeleccionado.id.toLowerCase();
      if (dest.includes('pamplona')) {
        return 100000;
      }
      if (dest.includes('chinacota') || dest.includes('durania') || dest.includes('bochalema')) {
        return 70000;
      }
      return 50000;
    }
  };

  const trasladoCalculado = calcularTrasladoEnVivo();

  const limpiar = () => {
    setPaso({ kind: 'servicio' });
    setNumeroOrden('');
    setMarcaSeleccionada('SAMSUNG');
    setTipoId('');
    setDescripcion('');
    setTransportType('MOTO_PROPIA');
    setLugarId('');
    setError('');
    setActiveValidation(false);
  };

  const handleCancelar = () => {
    limpiar();
    onClose();
  };

  const validarOrden = (valor: string) => {
    const digits = valor.replace(/^(T-)?(BUC|CUC)-/i, '').trim();
    if (!/^\d{5}$/.test(digits)) {
      return 'El número de orden debe contener exactamente 5 dígitos numéricos.';
    }
    return '';
  };

  const handleSiguienteServicio = async () => {
    setActiveValidation(true);
    setError('');

    const ordenError = validarOrden(numeroOrden);
    if (ordenError) {
      setError(ordenError);
      return;
    }

    if (!tipoId) {
      setError('Selecciona un tipo de servicio.');
      return;
    }

    if (!descripcion.trim()) {
      setError('La descripción es obligatoria.');
      return;
    }

    setSaving(true);
    try {
      const cleanDigits = numeroOrden.replace(/^(T-)?(BUC|CUC)-/i, '').trim();
      const servicio = await onCreateService({
        tipo_servicio_id: tipoId,
        numero_orden: cleanDigits,
        descripcion_especifica: descripcion.trim(),
      });
      const tipo = types.find((t) => t.id === tipoId);
      setPaso({
        kind: 'traslado',
        servicioId: servicio.id,
        tipoId,
        tipoNombre: tipo?.nombre ?? '',
        tipoValor: tipo ? Number(tipo.valor_estandar) : 0,
        numeroOrden: cleanDigits,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el servicio.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizarSinTraslado = async () => {
    setSaving(true);
    setError('');
    try {
      await onClose();
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
        tipoValor: prev.tipoValor,
        trasladoId: traslado.id,
        trasladoNombre: `${lugar?.nombre} (${tipoVehiculoLabel[transportType]})`,
        trasladoValor: valorRegistrado,
        numeroOrden: prev.numeroOrden,
      });
    } catch (err) {
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
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '13px', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: '600', color: 'var(--ink)' }}>{it.label}</div>
                {it.sub && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{it.sub}</div>}
              </div>
              <span style={{ fontWeight: '700', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                {formatCOP(it.valor)}
              </span>
            </div>
          ))}
        </div>

        <div style={ticketTotalStyle}>
          <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--ink)' }}>Total Orden</span>
          <span style={{ fontWeight: '800', fontSize: '18px', color: 'var(--blue)' }}>{formatCOP(total)}</span>
        </div>
      </div>
    );
  };

  const renderPaso = () => {
    switch (paso.kind) {
      case 'servicio': {
        const ticketItems = tipoActual
          ? [{ label: tipoActual.nombre, sub: 'Servicio técnico', valor: tipoValor }]
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
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="Ej: 10452"
                  value={numeroOrden.replace(/^(T-)?(BUC|CUC)-/i, '')}
                  onChange={(e) => {
                    const onlyNums = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setNumeroOrden(onlyNums);
                    if (activeValidation) setError('');
                  }}
                  onBlur={() => {
                    if (activeValidation && validarOrden(numeroOrden)) {
                      setError(validarOrden(numeroOrden));
                    }
                  }}
                  style={inputStyle}
                />
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Ingresa exactamente 5 dígitos numéricos.
                </p>
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
                  onChange={(e) => { setTipoId(e.target.value); if (activeValidation) setError(''); }}
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
                  }}
                  onBlur={() => {
                    if (activeValidation && !descripcion.trim()) setError('La descripción es obligatoria.');
                  }}
                  style={inputStyle}
                />
              </div>

              {/* Ticket de cuenta en tiempo real */}
              {renderTicket(ticketItems, tipoValor)}

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', backgroundColor: 'rgba(211,47,47,0.08)', border: '1px solid rgba(211,47,47,0.3)', color: '#b3261e', fontSize: '13px', fontWeight: '500' }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="button" onClick={handleCancelar} style={{ flex: 1, padding: '12px', borderRadius: '11px', border: '1px solid rgba(0,0,0,0.12)', background: 'white', color: 'var(--ink)', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}>
                  Cancelar
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
          { label: prev.tipoNombre, sub: 'Servicio base', valor: prev.tipoValor },
        ];
        if (lugarSeleccionado) {
          items.push({
            label: `Traslado a ${lugarSeleccionado.nombre}`,
            sub: tipoVehiculoLabel[transportType],
            valor: trasladoCalculado,
          });
        }

        const totalConTraslado = prev.tipoValor + trasladoCalculado;

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
                    onClick={() => { setTransportType('MOTO_PROPIA'); setError(''); }}
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
                  <button
                    type="button"
                    onClick={() => { setTransportType('EMPRESA'); setError(''); }}
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
                </div>
              </fieldset>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Lugar de traslado</label>
                <select
                  value={lugarId}
                  onChange={(e) => { setLugarId(e.target.value); setError(''); }}
                  style={inputStyle}
                >
                  <option value="">Selecciona el destino...</option>
                  {lugares.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ticket con cálculo en tiempo real */}
              {renderTicket(items, totalConTraslado)}

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
                  disabled={saving || !lugarId}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '11px',
                    border: 'none',
                    background: saving || !lugarId ? 'var(--text-secondary)' : 'var(--blue)',
                    color: 'white',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: saving || !lugarId ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Guardando traslado…' : 'Guardar traslado y finalizar orden'}
                </button>
              </div>
            </div>
          </>
        );
      }

      case 'final': {
        const fin = paso as Extract<typeof paso, { kind: 'final' }>;
        const total = fin.tipoValor + fin.trasladoValor;
        const finalItems = [
          { label: fin.tipoNombre, sub: 'Servicio técnico', valor: fin.tipoValor },
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
  backgroundColor: '#f8fafc',
  border: '1px dashed #cbd5e1',
  borderRadius: '14px',
  padding: '16px',
};

const ticketHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: '10px',
  borderBottom: '1px dashed #cbd5e1',
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
  borderTop: '1px dashed #94a3b8',
};
