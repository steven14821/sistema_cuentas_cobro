require('dotenv').config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 1: Renombrar / desactivar registros viejos que ya existen en la BD
  // ─────────────────────────────────────────────────────────────────────────────

  // Helper: renombra un tipo si existe, migrando servicios al nuevo nombre si ya existe
  async function renameType(oldName: string, newName: string, newValor?: number) {
    const oldType = await prisma.tipos_servicio.findUnique({ where: { nombre: oldName } });
    if (!oldType) return;
    const newType = await prisma.tipos_servicio.findUnique({ where: { nombre: newName } });
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

  // Helper: desactiva un tipo si existe (no borra, para mantener historial)
  async function deactivateType(nombre: string) {
    const t = await prisma.tipos_servicio.findUnique({ where: { nombre } });
    if (!t) return;
    await prisma.tipos_servicio.update({ where: { id: t.id }, data: { activo: false } });
    console.log(`  🗑️  Desactivado: "${nombre}"`);
  }

  console.log('🚀 Iniciando migración de nombres...');

  // --- Diagnóstico: de "Diagnóstico TV" al nuevo esquema ---
  for (const marca of ['SAMSUNG', 'HISENSE', 'HYUNDAI', 'TCL', 'ZURICH'] as const) {
    await renameType(`${marca}: Diagnóstico TV`, `${marca}: Diagnóstico garantía`);
  }

  // --- Garantía → Reparación (Samsung explícitos) ---
  const samRenames: [string, string][] = [
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
    // Reparaci (nombre truncado)
    ['SAMSUNG: Reparaci',                              'SAMSUNG: Reparación Nevera o Nevecon carga de gas'],
  ];
  for (const [oldN, newN] of samRenames) {
    await renameType(oldN, newN);
  }

  // --- Desactivar servicios eliminados ---
  const toDeactivate = [
    'SAMSUNG: Reparación TV IH (Carro Personal)',
    'SAMSUNG: Garantía TV IH (Carro Personal)',
    'SAMSUNG: Reparación TV IH (60" o más)',
    'SAMSUNG: Garantía TV IH (60" o más)',
  ];
  for (const nombre of toDeactivate) {
    await deactivateType(nombre);
  }

  // --- Mismo tratamiento para HYUNDAI y TCL ---
  for (const marca of ['HYUNDAI', 'TCL'] as const) {
    const marcaRenames: [string, string][] = [
      [`${marca}: Garantía TV IH (Carro Personal)`,        `${marca}: Reparación TV IH (Carro Personal)`],
      [`${marca}: Reparación TV IH (Carro Personal)`,      `${marca}: Desactivado_IH_Carro_Personal`], // se desactivará abajo
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
    ];
    for (const [oldN, newN] of marcaRenames) {
      await renameType(oldN, newN);
    }
    // Desactivar eliminados para esta marca
    for (const suffix of ['Desactivado_IH_Carro_Personal', 'Desactivado_IH_60_o_mas']) {
      await deactivateType(`${marca}: ${suffix}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PASO 2: Upsert del catálogo canónico
  // ─────────────────────────────────────────────────────────────────────────────

  const tariffs = [
    // Samsung
    { nombre: 'SAMSUNG: Taller TV', valor: 18000 },
    { nombre: 'SAMSUNG: Taller Linea blanca', valor: 18000 },
    { nombre: 'SAMSUNG: Taller Monitor Gamer', valor: 16000 },
    { nombre: 'SAMSUNG: Reparación taller equipos pequeños', valor: 11000 },
    { nombre: 'SAMSUNG: Ayudantes', valor: 10000 },
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
    { nombre: 'SAMSUNG: Reparación TV recogido almacén (barras)', valor: 47000 },
    { nombre: 'SAMSUNG: Reparación TV mayor a 75"', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación IH de barras led', valor: 38000 },
    { nombre: 'SAMSUNG: Reparación estufa', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación nevera', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación lavadora', valor: 20000 },
    { nombre: 'SAMSUNG: Reparación lavadora (Tina Carga Frontal)', valor: 40000 },
    { nombre: 'SAMSUNG: Reparación Nevera o Nevecon carga de gas', valor: 90000 },
    { nombre: 'SAMSUNG: Instalación nevera', valor: 15000 },
    { nombre: 'SAMSUNG: Instalación lavadora superior', valor: 10000 },
    { nombre: 'SAMSUNG: Instalación lavadora frontal', valor: 14000 },
    { nombre: 'SAMSUNG: Instalación secadora', valor: 40000 },
    { nombre: 'SAMSUNG: Instalación lavavajillas', valor: 35000 },
    { nombre: 'SAMSUNG: Instalación torre', valor: 60000 },
    { nombre: 'SAMSUNG: Instalación de bespoke', valor: 25000 },
    { nombre: 'SAMSUNG: Instalación combo', valor: 60000 },
    { nombre: 'SAMSUNG: Instalación TV (32" a 60" ayudante)', valor: 40000 },
    { nombre: 'SAMSUNG: Instalación TV (65" a 77" incluye ayudante)', valor: 50000 },
    { nombre: 'SAMSUNG: Instalación TV (80" a 100" incluye ayudante)', valor: 80000 },
    { nombre: 'SAMSUNG: IH panel hasta 60"', valor: 25000 },
    { nombre: 'SAMSUNG: IH panel a partir de 60" (incluye ayudante)', valor: 35000 },
    { nombre: 'SAMSUNG: IH Paneles a partir 75" (incluye ayudante)', valor: 50000 },
    { nombre: 'SAMSUNG: Recolección Nevecon cambio (incluye ayudante)', valor: 30000 },
    { nombre: 'SAMSUNG: Recolección Nevecon mano a mano', valor: 40000 },
    { nombre: 'SAMSUNG: Recolección producto cambio lav/nev', valor: 15000 },
    { nombre: 'SAMSUNG: Recolección producto cambio lav/nev (Frontal ayudante)', valor: 25000 },
    { nombre: 'SAMSUNG: Recolección aire acondicionado', valor: 15000 },
    { nombre: 'SAMSUNG: Recolección aire (desinstalar + ayudante)', valor: 55000 },
    { nombre: 'SAMSUNG: Recolección TV cambio hasta 58"', valor: 10000 },
    { nombre: 'SAMSUNG: Recolección TV cambio 60"-70" (ayudante)', valor: 20000 },
    { nombre: 'SAMSUNG: Recolección TV cambio a partir de 75" (+ ayudante)', valor: 25000 },
    { nombre: 'SAMSUNG: Recolección mano a mano (Lav/Nev)', valor: 10000 },
    { nombre: 'SAMSUNG: Recolección mano a mano (TV)', valor: 5000 },
    { nombre: 'SAMSUNG: Desmonte cualquier tamaño', valor: 5000 },
    { nombre: 'SAMSUNG: Desmonte carro propio', valor: 10000 },
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

    // Diagnóstico de garantía de TV — disponible para todas las marcas.
    // ⚠️  NO renombrar: "Diagnóstico garantía" se conserva tal cual.
    ...(['SAMSUNG', 'HISENSE', 'HYUNDAI', 'TCL', 'ZURICH'] as const).map((marca) => ({
      nombre: `${marca}: Diagnóstico garantía`,
      valor: 10000,
    })),

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
        { servicio: 'Reparación TV recogido almacén (barras)', valor: 47000 },
        { servicio: 'Reparación IH de barras led', valor: 38000 },
        { servicio: 'Instalación TV (32" a 60" ayudante)', valor: 40000 },
        { servicio: 'Instalación TV (65" a 77" incluye ayudante)', valor: 50000 },
        { servicio: 'Instalación TV (80" a 100" incluye ayudante)', valor: 80000 },
        { servicio: 'IH panel hasta 60"', valor: 25000 },
        { servicio: 'IH panel a partir de 60" (incluye ayudante)', valor: 35000 },
        { servicio: 'IH Paneles a partir 75" (incluye ayudante)', valor: 50000 },
        { servicio: 'Recolección TV cambio hasta 58"', valor: 10000 },
        { servicio: 'Recolección TV cambio 60"-70" (ayudante)', valor: 20000 },
        { servicio: 'Recolección TV cambio a partir de 75" (+ ayudante)', valor: 25000 },
        { servicio: 'Recolección mano a mano (TV)', valor: 5000 },
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

  console.log('📦 Upsert del catálogo canónico...');

  for (const t of tariffs) {
    await prisma.tipos_servicio.upsert({
      where: { nombre: t.nombre },
      update: {
        valor_estandar: t.valor,
        activo: true,
      },
      create: {
        nombre: t.nombre,
        valor_estandar: t.valor,
        activo: true,
      },
    });
  }

  console.log('✅ Tarifas actualizadas correctamente.');
  await app.close();
  process.exit(0);
}

bootstrap();
