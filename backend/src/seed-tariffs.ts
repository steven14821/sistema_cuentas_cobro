require('dotenv').config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  // --dry recorre TODAS las fases y reporta, sin escribir en la base de datos.
  const DRY = process.argv.includes('--dry');

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 1: Renombrar / eliminar registros viejos que ya existen en la BD
  //         Se usa DELETE (no desactivar) para que no aparezcan en la app.
  // ─────────────────────────────────────────────────────────────────────────────

  /** Tipos que no se pudieron eliminar; se reportan al final para no callarlos. */
  const bloqueados: { nombre: string; motivo: string }[] = [];

  /** Renombra un tipo si existe, migrando servicios al destino si ya existe. */
  async function renameType(oldName: string, newName: string, newValor?: number) {
    const oldType = await prisma.tipos_servicio.findUnique({ where: { nombre: oldName } });
    if (!oldType) return;
    const newType = await prisma.tipos_servicio.findUnique({ where: { nombre: newName } });
    if (DRY) {
      console.log(`  ✏️  [dry] "${oldName}" → "${newName}"${newType ? '  (colisiona: migraría servicios y borraría el origen)' : ''}`);
      return;
    }
    await prisma.$transaction(async (tx) => {
      if (newType) {
        await tx.servicios.updateMany({
          where: { tipo_servicio_id: oldType.id },
          data: { tipo_servicio_id: newType.id },
        });
        await tx.tipos_servicio.delete({ where: { id: oldType.id } });
      } else {
        await tx.tipos_servicio.update({
          where: { id: oldType.id },
          data: {
            nombre: newName,
            ...(newValor !== undefined ? { valor_estandar: newValor } : {}),
            activo: true,
          },
        });
      }
    });
    console.log(`  ✏️  "${oldName}" → "${newName}"`);
  }

  /** Elimina un tipo completamente (redirige servicios al destino si se da). */
  async function deleteType(nombre: string, redirectTo?: string) {
    const t = await prisma.tipos_servicio.findUnique({ where: { nombre } });
    if (!t) return;
    if (DRY) {
      console.log(`  🗑️  [dry] eliminar "${nombre}"${redirectTo ? ` → reasignando servicios a "${redirectTo}"` : ''}`);
      return;
    }
    if (redirectTo) {
      const dest = await prisma.tipos_servicio.findUnique({ where: { nombre: redirectTo } });
      if (dest) {
        await prisma.servicios.updateMany({
          where: { tipo_servicio_id: t.id },
          data: { tipo_servicio_id: dest.id },
        });
      }
    }
    // La FK servicios→tipos_servicio es onDelete: NoAction, así que un tipo con
    // servicios históricos NO se puede borrar sin reasignarlos antes. Fallamos de
    // forma visible en lugar de desactivar a escondidas: el usuario verá el tipo
    // aunque crea que lo eliminamos.
    try {
      await prisma.tipos_servicio.delete({ where: { id: t.id } });
      console.log(`  🗑️  Eliminado: "${nombre}"`);
    } catch {
      bloqueados.push({ nombre, motivo: 'tiene servicios asociados y no se indicó sucesor' });
      console.warn(`  ⛔ NO se pudo eliminar "${nombre}" (tiene servicios asociados).`);
    }
  }

  console.log('🚀 Iniciando migración de nombres...');

  // ── Diagnóstico TV → garantía (legado) ───────────────────────────────────────
  // ZURICH fuera: su 'Diagnóstico garantía' se purge y pasa a 'Diagnostico TV'.
  for (const marca of ['SAMSUNG', 'HISENSE', 'HYUNDAI', 'TCL'] as const) {
    await renameType(`${marca}: Diagnóstico TV`, `${marca}: Diagnóstico garantía`);
  }

  // ── Renombres SAMSUNG ─────────────────────────────────────────────────────────
  const samRenames: [string, string, number?][] = [
    ['SAMSUNG: Garantía taller equipos pequeños',      'SAMSUNG: Reparación taller equipos pequeños'],
    ['SAMSUNG: Garantía SR TV',                        'SAMSUNG: Reparación SR TV'],
    ['SAMSUNG: Garantía TV almacén',                   'SAMSUNG: Reparación TV almacén hasta 60"'],
    ['SAMSUNG: Reparación TV almacén',                 'SAMSUNG: Reparación TV almacén hasta 60"'],
    ['SAMSUNG: Garantía TV almacén (65" o más)',       'SAMSUNG: Reparación TV almacén desde 65"'],
    ['SAMSUNG: Reparación TV almacén (65" o más)',     'SAMSUNG: Reparación TV almacén desde 65"'],
    ['SAMSUNG: Garantia hornos y torres almacén',      'SAMSUNG: Reparación hornos y torres almacén'],
    ['SAMSUNG: Garantía linea blanca almacén',         'SAMSUNG: Reparación linea blanca almacén'],
    ['SAMSUNG: Garantia TV IH partes pequeñas',        'SAMSUNG: Reparación TV IH partes pequeñas hasta 60"'],
    ['SAMSUNG: Reparación TV IH partes pequeñas',      'SAMSUNG: Reparación TV IH partes pequeñas hasta 60"'],
    ['SAMSUNG: Garantia TV IH partes pequeñas (65"/75" ayudante)', 'SAMSUNG: Reparación TV IH partes pequeñas (De 65" y 70" incluye ayudante)'],
    ['SAMSUNG: Reparación TV IH partes pequeñas (65"/75" ayudante)', 'SAMSUNG: Reparación TV IH partes pequeñas (De 65" y 70" incluye ayudante)'],
    ['SAMSUNG: Garantia TV IH partes pequeñas (desde 75")', 'SAMSUNG: Reparación TV IH partes pequeñas (Desde 75" incluye ayudante)'],
    ['SAMSUNG: Reparación TV IH partes pequeñas (desde 75")', 'SAMSUNG: Reparación TV IH partes pequeñas (Desde 75" incluye ayudante)'],
    ['SAMSUNG: Garantía aire',                         'SAMSUNG: Reparación aire'],
    ['SAMSUNG: Garantía TV recogido almacén (barras)', 'SAMSUNG: Reparación TV recogido almacén (barras)'],
    ['SAMSUNG: Garantía TV mayor a 75"',               'SAMSUNG: Reparación TV mayor a 75"'],
    ['SAMSUNG: Garantía nevera',                       'SAMSUNG: Reparación nevera'],
    ['SAMSUNG: Garantía lavadora',                     'SAMSUNG: Reparación lavadora'],
    ['SAMSUNG: Garantía lavadora (Tina Carga Frontal)','SAMSUNG: Reparación lavadora (Tina Carga Frontal)'],
    // Eco Repair transportadora/carry-in → Taller
    ['SAMSUNG: Eco repair almacenes',                  'SAMSUNG: Eco Repair Taller'],
    // Paneles facturado → nombre real
    ['SAMSUNG: Facturado Panel 75"',                   'SAMSUNG: Instalacion Panel ow de 65" hasta 75"'],
    ['SAMSUNG: Instalación Panel ow de 65" a 75"',    'SAMSUNG: Instalacion Panel ow de 65" hasta 75"'],
    ['SAMSUNG: Facturado panel 58" para abajo',        'SAMSUNG: Instalacion Panel ow hasta 58"'],
    ['SAMSUNG: Instalación Panel ow hasta 58"',        'SAMSUNG: Instalacion Panel ow hasta 58"'],
    // IH panel renombres
    ['SAMSUNG: IH panel hasta 60"',                   'SAMSUNG: Reparación IH TV panel hasta 60"'],
    ['SAMSUNG: IH panel a partir de 60" (incluye ayudante)', 'SAMSUNG: Reparación IH TV panel de 60" a 70" (incluye ayudante)'],
    ['SAMSUNG: IH Paneles a partir 75" (incluye ayudante)', 'SAMSUNG: Reparación IH TV panel desde 75" (incluye ayudante)'],
    // Instalaciones renombradas
    ['SAMSUNG: Instalación de bespoke',               'SAMSUNG: Instalación Nevecion Bespoke'],
    ['SAMSUNG: Instalación nevera',                   'SAMSUNG: Instalación Nevecon'],
    // Recolección aire → split
    ['SAMSUNG: Recolección aire (desinstalar + ayudante)', 'SAMSUNG: Recolección aire acondicionado split (incluye ayudante)', 25000],
    ['SAMSUNG: Recolección aire acondicionado',       'SAMSUNG: Recolección de aire acondicionado split con desinstalación (incluye ayudante)'],
    // Reparaci (nombre truncado)
    ['SAMSUNG: Reparaci',                              'SAMSUNG: Reparación Nevera o Nevecon carga de gas'],
  ];
  for (const [oldN, newN, val] of samRenames) {
    await renameType(oldN, newN, val);
  }

  // Instalación combo → Instalación secadora (50000)
  // Si ya existe Instalación secadora con otro valor, primero la eliminamos
  await renameType('SAMSUNG: Instalación combo', 'SAMSUNG: Instalación secadora', 50000);

  // ── Eliminar servicios SAMSUNG que no se usan ─────────────────────────────────
  const samDelete = [
    'SAMSUNG: Reparación TV IH (Carro Personal)',
    'SAMSUNG: Garantía TV IH (Carro Personal)',
    'SAMSUNG: Reparación TV IH (60" o más)',
    'SAMSUNG: Garantía TV IH (60" o más)',
    'SAMSUNG: Reparación TV mayor a 75"',
    'SAMSUNG: Reparación TV recogido almacén (barras)',
    // residuos de sesiones anteriores
    'SAMSUNG: Reparacion taller equipos pequeños',
    'SAMSUNG: Reparacion TV IH (Carro Personal)',
    'SAMSUNG: Reparacion TV IH (60" o más)',
    'SAMSUNG: Reparacion SR TV',
    'SAMSUNG: Reparacion TV almacén hasta 60"',
    'SAMSUNG: Reparacion TV almacén desde 65"',
    'SAMSUNG: Garantia TV IH partes pequeñas',
    'SAMSUNG: Reparacion TV IH partes pequeñas hasta 60"',
    'SAMSUNG: Reparacion aire',
    'SAMSUNG: Reparacion TV recogido almacén (barras)',
    'SAMSUNG: Reparacion TV mayor a 75"',
    'SAMSUNG: Reparacion nevera',
    'SAMSUNG: Reparacion lavadora',
    'SAMSUNG: Reparacion lavadora (Tina Carga Frontal)',
    'SAMSUNG: Reparacion hornos y torres almacén',
    'SAMSUNG: Reparacion linea blanca almacén',
    'SAMSUNG: Reparacion TV IH partes pequeñas (De 65" y 70" incluye ayudante)',
    'SAMSUNG: Reparacion TV IH partes pequeñas (Desde 75" incluye ayudante)',
    'SAMSUNG: Reparacion IH TV panel hasta 60"',
    'SAMSUNG: Reparacion IH TV panel de 60" a 70" (incluye ayudante)',
    'SAMSUNG: Reparacion IH TV panel desde 75" (incluye ayudante)',
  ];
  for (const nombre of samDelete) {
    await deleteType(nombre);
  }

  // ── Renombres HYUNDAI y TCL ───────────────────────────────────────────────────
  for (const marca of ['HYUNDAI', 'TCL'] as const) {
    const marcaRenames: [string, string, number?][] = [
      [`${marca}: Garantía TV IH (Carro Personal)`,        `${marca}: Desactivado_IH_Carro_Personal`],
      [`${marca}: Reparación TV IH (Carro Personal)`,      `${marca}: Desactivado_IH_Carro_Personal`],
      [`${marca}: Garantía TV IH (60" o más)`,             `${marca}: Desactivado_IH_60_o_mas`],
      [`${marca}: Reparación TV IH (60" o más)`,           `${marca}: Desactivado_IH_60_o_mas`],
      [`${marca}: Garantía SR TV`,                         `${marca}: Reparación SR TV`],
      [`${marca}: Garantía TV almacén`,                    `${marca}: Reparación TV almacén hasta 60"`],
      [`${marca}: Reparación TV almacén`,                  `${marca}: Reparación TV almacén hasta 60"`],
      [`${marca}: Garantía TV almacén (65" o más)`,        `${marca}: Reparación TV almacén desde 65"`],
      [`${marca}: Reparación TV almacén (65" o más)`,      `${marca}: Reparación TV almacén desde 65"`],
      [`${marca}: Garantía TV IH partes pequeñas`,         `${marca}: Reparación TV IH partes pequeñas hasta 60"`],
      [`${marca}: Reparación TV IH partes pequeñas`,       `${marca}: Reparación TV IH partes pequeñas hasta 60"`],
      [`${marca}: Garantía TV IH partes pequeñas (65"/75" ayudante)`, `${marca}: Reparación TV IH partes pequeñas (De 65" y 70" incluye ayudante)`],
      [`${marca}: Reparación TV IH partes pequeñas (65"/75" ayudante)`, `${marca}: Reparación TV IH partes pequeñas (De 65" y 70" incluye ayudante)`],
      [`${marca}: Garantía TV IH partes pequeñas (desde 75")`, `${marca}: Reparación TV IH partes pequeñas (Desde 75" incluye ayudante)`],
      [`${marca}: Reparación TV IH partes pequeñas (desde 75")`, `${marca}: Reparación TV IH partes pequeñas (Desde 75" incluye ayudante)`],
      [`${marca}: Garantía TV recogido almacén (barras)`,  `${marca}: Reparación TV recogido almacén (barras)`],
      [`${marca}: Eco repair almacenes`,                   `${marca}: Eco Repair Taller`],
      [`${marca}: Facturado Panel 75"`,                    `${marca}: Instalacion Panel ow de 65" hasta 75"`],
      [`${marca}: Facturado panel 58" para abajo`,         `${marca}: Instalacion Panel ow hasta 58"`],
      [`${marca}: IH panel hasta 60"`,                    `${marca}: Reparación IH TV panel hasta 60"`],
      [`${marca}: IH panel a partir de 60" (incluye ayudante)`, `${marca}: Reparación IH TV panel de 60" a 70" (incluye ayudante)`],
      [`${marca}: IH Paneles a partir 75" (incluye ayudante)`, `${marca}: Reparación IH TV panel desde 75" (incluye ayudante)`],
      [`${marca}: Reparación TV mayor a 75"`,              `${marca}: Desactivado_mayor75`],
      [`${marca}: Reparación TV recogido almacén (barras)`, `${marca}: Desactivado_recogido`],
    ];
    for (const [oldN, newN, val] of marcaRenames) {
      await renameType(oldN, newN, val);
    }
    // Eliminar los temporales y los de IH Carro/60
    const marcaDelete = [
      `${marca}: Desactivado_IH_Carro_Personal`,
      `${marca}: Desactivado_IH_60_o_mas`,
      `${marca}: Desactivado_mayor75`,
      `${marca}: Desactivado_recogido`,
    ];
    for (const nombre of marcaDelete) {
      await deleteType(nombre);
    }
  }

  // ── Recolección: renombrados de esta ronda ───────────────────────────────────
  await renameType(
    'SAMSUNG: Recolección producto cambio lav/nev',
    'SAMSUNG: Recolección producto cambio Lavadora sup/Nevera',
  );
  await renameType(
    'SAMSUNG: Recolección producto cambio lav/nev (Frontal ayudante)',
    'SAMSUNG: Recolección producto cambio Lavadora frontal (incluye ayudante)',
  );
  // "(+ ayudante)" pasa a llamarse "a partir de 75"" y sube a 30.000 en las 3 marcas.
  for (const marca of ['SAMSUNG', 'HYUNDAI', 'TCL'] as const) {
    await renameType(
      `${marca}: Recolección TV cambio a partir de 75" (+ ayudante)`,
      `${marca}: Recolección TV a partir de 75"`,
      30000,
    );
    // Residuos de la ronda anterior que ya no están en el catálogo canónico.
    await deleteType(`${marca}: Recolección TV cambio a partir de 75"`);
    await deleteType(`${marca}: Recolección mano a mano (TV)`);
    await deleteType(`${marca}: Reparación IH de barras led`);
  }
  await deleteType('SAMSUNG: Recolección mano a mano (Lav/Nev)');

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 2: Upsert del catálogo canónico (nombres definitivos)
  // ─────────────────────────────────────────────────────────────────────────────

  const tariffs = [
    // Samsung
    { nombre: 'SAMSUNG: Taller TV', valor: 18000 },
    { nombre: 'SAMSUNG: Taller Linea blanca', valor: 18000 },
    { nombre: 'SAMSUNG: Taller Monitor Gamer', valor: 16000 },
    { nombre: 'SAMSUNG: Reparación taller equipos pequeños', valor: 11000 },
    { nombre: 'SAMSUNG: Reparación SR TV', valor: 18000 },
    { nombre: 'SAMSUNG: Reparación TV almacén hasta 60"', valor: 25000 },
    { nombre: 'SAMSUNG: Reparación TV almacén desde 65"', valor: 35000 },
    { nombre: 'SAMSUNG: Reparación hornos y torres almacén', valor: 15000 },
    { nombre: 'SAMSUNG: Reparación linea blanca almacén', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación TV IH partes pequeñas hasta 60"', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación TV IH partes pequeñas (De 65" y 70" incluye ayudante)', valor: 30000 },
    { nombre: 'SAMSUNG: Reparación TV IH partes pequeñas (Desde 75" incluye ayudante)', valor: 50000 },
    { nombre: 'SAMSUNG: Reparación aire', valor: 35000 },
    { nombre: 'SAMSUNG: Diagnostico aire', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación estufa', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación nevera', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación lavadora', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación lavadora (Tina Carga Frontal)', valor: 40000 },
    { nombre: 'SAMSUNG: Reparación Nevera o Nevecon carga de gas', valor: 90000 },
    { nombre: 'SAMSUNG: Instalación Nevecon', valor: 15000 },
    { nombre: 'SAMSUNG: Instalación lavadora superior', valor: 10000 },
    { nombre: 'SAMSUNG: Instalación lavadora frontal', valor: 14000 },
    { nombre: 'SAMSUNG: Instalación secadora', valor: 50000 },
    { nombre: 'SAMSUNG: Instalación lavavajillas', valor: 35000 },
    { nombre: 'SAMSUNG: Instalación torre', valor: 60000 },
    { nombre: 'SAMSUNG: Instalación Nevecion Bespoke', valor: 25000 },
    { nombre: 'SAMSUNG: Instalación TV (32" a 60" ayudante)', valor: 40000 },
    { nombre: 'SAMSUNG: Instalación TV (65" a 77" incluye ayudante)', valor: 50000 },
    { nombre: 'SAMSUNG: Instalación TV (80" a 100" incluye ayudante)', valor: 80000 },
    { nombre: 'SAMSUNG: Reparación IH TV panel hasta 60"', valor: 25000 },
    { nombre: 'SAMSUNG: Reparación IH TV panel de 60" a 70" (incluye ayudante)', valor: 35000 },
    { nombre: 'SAMSUNG: Reparación IH TV panel desde 75" (incluye ayudante)', valor: 50000 },
    { nombre: 'SAMSUNG: Recolección Nevecon cambio (incluye ayudante)', valor: 30000 },
    { nombre: 'SAMSUNG: Recolección Nevecon mano a mano', valor: 40000 },
    { nombre: 'SAMSUNG: Recolección producto cambio Lavadora sup/Nevera', valor: 15000 },
    { nombre: 'SAMSUNG: Recolección producto cambio Lavadora frontal (incluye ayudante)', valor: 25000 },
    { nombre: 'SAMSUNG: Recolección aire acondicionado split (incluye ayudante)', valor: 25000 },
    { nombre: 'SAMSUNG: Recolección de aire acondicionado split con desinstalación (incluye ayudante)', valor: 55000 },
    { nombre: 'SAMSUNG: Recolección TV cambio hasta 58"', valor: 10000 },
    { nombre: 'SAMSUNG: Recolección TV cambio 60"-70" (ayudante)', valor: 20000 },
    { nombre: 'SAMSUNG: Recolección TV a partir de 75"', valor: 30000 },
    { nombre: 'SAMSUNG: Eco Repair IH hasta 60"', valor: 38000 },
    { nombre: 'SAMSUNG: Eco Repair IH 65" y 70"', valor: 48000 },
    { nombre: 'SAMSUNG: Eco Repair IH desde 75" (incluye ayudantes)', valor: 75000 },
    { nombre: 'SAMSUNG: Eco Repair Taller', valor: 26000 },
    { nombre: 'SAMSUNG: Limpieza partículas pantalla', valor: 30000 },
    { nombre: 'SAMSUNG: Instalacion Panel ow de 65" hasta 75"', valor: 75000 },
    { nombre: 'SAMSUNG: Instalacion Panel ow hasta 58"', valor: 55000 },

    // Traslados BGA
    { nombre: 'TRASLADO: Piedecuesta', valor: 8000 },
    { nombre: 'TRASLADO: Giron', valor: 5000 },
    { nombre: 'TRASLADO: Lebrija', valor: 10000 },
    { nombre: 'TRASLADO: Florida', valor: 3000 },
    { nombre: 'TRASLADO: Los Santos', valor: 25000 },
    { nombre: 'TRASLADO: Rionegro-Playon', valor: 30000 },
    { nombre: 'TRASLADO: Pescadero', valor: 25000 },
    { nombre: 'TRASLADO: Zapatoca', valor: 60000 },
    { nombre: 'TRASLADO: Curos', valor: 12000 },
    { nombre: 'TRASLADO: Sogamoso', valor: 35000 },
    { nombre: 'TRASLADO: Matanza', valor: 25000 },
    { nombre: 'TRASLADO: Acapulco', valor: 9000 },
    { nombre: 'TRASLADO: San Vicente', valor: 75000 },
    { nombre: 'TRASLADO: Barrancabermeja', valor: 85000 },
    { nombre: 'TRASLADO: San Gil', valor: 95000 },

    // Traslados Cúcuta
    { nombre: 'TRASLADO CUC: Patios', valor: 4000 },
    { nombre: 'TRASLADO CUC: Villa del Rosario', valor: 4000 },
    { nombre: 'TRASLADO CUC: Zulia', valor: 8000 },
    { nombre: 'TRASLADO CUC: Toledo', valor: 140000 },
    { nombre: 'TRASLADO CUC: Pamplona', valor: 55000 },
    { nombre: 'TRASLADO CUC: Mutiscua', valor: 65000 },
    { nombre: 'TRASLADO CUC: Chinácota', valor: 30000 },
    { nombre: 'TRASLADO CUC: Durania', valor: 35000 },
    { nombre: 'TRASLADO CUC: Bochalema', valor: 35000 },

    // Hisense
    { nombre: 'HISENSE: Cambio de parte (sin recolección)', valor: 25000 },
    { nombre: 'HISENSE: Cambio de parte (con recolección)', valor: 35000 },
    { nombre: 'HISENSE: Reparación de parte', valor: 45000 },
    { nombre: 'HISENSE: Diagnósticos/Ajustes/Cambios', valor: 20000 },
    { nombre: 'HISENSE: Cambio de compresor', valor: 90000 },
    { nombre: 'HISENSE: Cambio de parte aires', valor: 35000 },

    // Diagnóstico de garantía — ⚠️ NO renombrar, se conserva tal cual.
    // ZURICH queda fuera: su catálogo propio se define más abajo.
    ...(['SAMSUNG', 'HISENSE', 'HYUNDAI', 'TCL'] as const).map((marca) => ({
      nombre: `${marca}: Diagnóstico garantía`,
      valor: 10000,
    })),

    // ZURICH: catálogo propio de diagnósticos, sin tarifa de garantía heredada.
    // 'Reparación' se siembra en 0 porque no lleva tarifa fija: el valor lo
    // asigna el admin. La UI para eso aún no existe (pendiente de feature).
    { nombre: 'ZURICH: Diagnostico TV', valor: 20000 },
    { nombre: 'ZURICH: Diagnostico de productos pequeños taller', valor: 10000 },
    { nombre: 'ZURICH: Diagnostico nevera/lavadora/secadora IH', valor: 15000 },
    { nombre: 'ZURICH: Diagnostico Nevecon IH', valor: 20000 },
    { nombre: 'ZURICH: Diagnostico lavavajillas IH', valor: 15000 },
    { nombre: 'ZURICH: Diagnostico aire split', valor: 20000 },
    { nombre: 'ZURICH: Reparación', valor: 0 },

    // Hyundai y TCL: catálogo exclusivo para TV.
    ...(['HYUNDAI', 'TCL'] as const).flatMap((marca) =>
      [
        { servicio: 'Taller TV', valor: 18000 },
        { servicio: 'Reparación SR TV', valor: 18000 },
        { servicio: 'Reparación TV almacén hasta 60"', valor: 25000 },
        { servicio: 'Reparación TV almacén desde 65"', valor: 35000 },
        { servicio: 'Reparación TV IH partes pequeñas hasta 60"', valor: 20000 },
        { servicio: 'Reparación TV IH partes pequeñas (De 65" y 70" incluye ayudante)', valor: 30000 },
        { servicio: 'Reparación TV IH partes pequeñas (Desde 75" incluye ayudante)', valor: 50000 },
        { servicio: 'Instalación TV (32" a 60" ayudante)', valor: 40000 },
        { servicio: 'Instalación TV (65" a 77" incluye ayudante)', valor: 50000 },
        { servicio: 'Instalación TV (80" a 100" incluye ayudante)', valor: 80000 },
        { servicio: 'Reparación IH TV panel hasta 60"', valor: 25000 },
        { servicio: 'Reparación IH TV panel de 60" a 70" (incluye ayudante)', valor: 35000 },
        { servicio: 'Reparación IH TV panel desde 75" (incluye ayudante)', valor: 50000 },
        { servicio: 'Recolección TV cambio hasta 58"', valor: 10000 },
        { servicio: 'Recolección TV cambio 60"-70" (ayudante)', valor: 20000 },
        { servicio: 'Recolección TV a partir de 75"', valor: 30000 },
        { servicio: 'Eco Repair IH hasta 60"', valor: 38000 },
        { servicio: 'Eco Repair IH 65" y 70"', valor: 48000 },
        { servicio: 'Eco Repair IH desde 75" (incluye ayudantes)', valor: 75000 },
        { servicio: 'Eco Repair Taller', valor: 26000 },
        { servicio: 'Limpieza partículas pantalla', valor: 30000 },
        { servicio: 'Instalacion Panel ow de 65" hasta 75"', valor: 75000 },
        { servicio: 'Instalacion Panel ow hasta 58"', valor: 55000 },
      ].map(({ servicio, valor }) => ({
        nombre: `${marca}: ${servicio}`,
        valor,
      })),
    ),
  ];

  console.log(`📦 Upsert del catálogo canónico (${tariffs.length} nombres)...`);

  if (DRY) {
    const existentes = new Set(
      (await prisma.tipos_servicio.findMany({ select: { nombre: true } })).map((t) => t.nombre),
    );
    const nuevos = tariffs.filter((t) => !existentes.has(t.nombre));
    console.log(`  [dry] ${tariffs.length - nuevos.length} existentes, ${nuevos.length} se crearían`);
    for (const t of nuevos) console.log(`    ➕ ${t.nombre} ($${t.valor})`);
  }

  for (const t of tariffs) {
    if (DRY) break;
    await prisma.tipos_servicio.upsert({
      where: { nombre: t.nombre },
      update: { valor_estandar: t.valor, activo: true },
      create: { nombre: t.nombre, valor_estandar: t.valor, activo: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 3: Purgar TODO tipo que no esté en el catálogo canónico.
  //         Sin esto, cualquier residuo queda ACTIVO y visible en el selector de
  //         la app para siempre, porque el upsert de arriba nunca lo toca.
  //   --dry  solo reporta, no escribe.
  // ─────────────────────────────────────────────────────────────────────────────

  console.log(`\n🧹 PASO 3: purga de tipos fuera del catálogo canónico${DRY ? ' (DRY RUN)' : ''}...`);

  /** Heredados con servicios históricos: se reasignan antes de borrar el tipo. */
  const sucesores: Record<string, string> = {
    'SAMSUNG: Carry IN taller TV': 'SAMSUNG: Eco Repair Taller',
    'SAMSUNG: Carry IN taller Monitor Gamer': 'SAMSUNG: Taller Monitor Gamer',
    'SAMSUNG: Carry IN o ps linea blanca': 'SAMSUNG: Reparación linea blanca almacén',
    'SAMSUNG: Eco Repair transportadora/Carry IN': 'SAMSUNG: Eco Repair Taller',
    'SAMSUNG: Recolección aire (desinstalar)':
      'SAMSUNG: Recolección de aire acondicionado split con desinstalación (incluye ayudante)',
    'SAMSUNG: Recolección TV cambio a partir de 75" (+ ayudante)':
      'SAMSUNG: Recolección TV a partir de 75"',
    'SAMSUNG: Recolección TV cambio a partir de 75"':
      'SAMSUNG: Recolección TV a partir de 75"',
    'SAMSUNG: Recolección producto cambio lav/nev (Frontal)':
      'SAMSUNG: Recolección producto cambio Lavadora frontal (incluye ayudante)',
    'SAMSUNG: Recolección producto cambio lav/nev (Frontal ayudante)':
      'SAMSUNG: Recolección producto cambio Lavadora frontal (incluye ayudante)',
    'SAMSUNG: Recolección producto cambio lav/nev':
      'SAMSUNG: Recolección producto cambio Lavadora sup/Nevera',
    // El catálogo usa "garantía" en minúscula; las variantes con mayúscula son dupe.
    ...Object.fromEntries(
      (['SAMSUNG', 'HISENSE', 'HYUNDAI', 'TCL'] as const).map((marca) => [
        `${marca}: Diagnóstico Garantía`,
        `${marca}: Diagnóstico garantía`,
      ]),
    ),
    // ZURICH ya no tiene "Diagnóstico garantía": su heredado pasa a "Diagnostico TV".
    'ZURICH: Diagnóstico Garantía': 'ZURICH: Diagnostico TV',
  };

  const nombresCanonicos = new Set(tariffs.map((t) => t.nombre));
  const todosTipos = await prisma.tipos_servicio.findMany({
    select: { id: true, nombre: true },
    orderBy: { nombre: 'asc' },
  });
  const huesfanos = todosTipos.filter((t) => !nombresCanonicos.has(t.nombre));

  if (huesfanos.length === 0) {
    console.log('  Nada que purgar: la BD ya coincide con el catálogo.');
  }

  for (const t of huesfanos) {
    const refs = await prisma.servicios.count({ where: { tipo_servicio_id: t.id } });
    const sucesorNombre = sucesores[t.nombre];

    let sucesorId: string | null = null;
    if (refs > 0) {
      if (!sucesorNombre) {
        bloqueados.push({ nombre: t.nombre, motivo: `${refs} servicios y sin sucesor configurado` });
        console.warn(`  ⛔ "${t.nombre}" tiene ${refs} servicios y no tiene sucesor.`);
        continue;
      }
      const sucesor = await prisma.tipos_servicio.findUnique({ where: { nombre: sucesorNombre } });
      if (!sucesor) {
        bloqueados.push({ nombre: t.nombre, motivo: `sucesor "${sucesorNombre}" no existe` });
        console.warn(`  ⛔ "${t.nombre}": no existe el sucesor "${sucesorNombre}".`);
        continue;
      }
      sucesorId = sucesor.id;
    }

    console.log(
      `  🗑️  Purgando "${t.nombre}"${refs > 0 ? ` → reasignando ${refs} servicio(s) a "${sucesorNombre}"` : ''}`,
    );
    if (DRY) continue;

    await prisma.$transaction(async (tx) => {
      if (sucesorId) {
        await tx.servicios.updateMany({
          where: { tipo_servicio_id: t.id },
          data: { tipo_servicio_id: sucesorId },
        });
      }
      await tx.tipos_servicio.delete({ where: { id: t.id } });
    });
  }

  if (bloqueados.length > 0) {
    console.error(`\n⚠️  ${bloqueados.length} tipo(s) NO se pudieron eliminar:`);
    for (const b of bloqueados) console.error(`     - ${b.nombre} (${b.motivo})`);
  }

  console.log(DRY ? '🧪 DRY RUN terminado: no se escribió nada.' : '✅ Tarifas actualizadas correctamente.');
  await app.close();
  process.exit(bloqueados.length > 0 ? 1 : 0);
}

bootstrap();
