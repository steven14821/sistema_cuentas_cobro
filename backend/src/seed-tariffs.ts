require('dotenv').config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  const tariffs = [
    // Samsung
    { nombre: 'SAMSUNG: Carry IN taller TV', valor: 18000 },
    { nombre: 'SAMSUNG: Carry IN o ps linea blanca', valor: 18000 },
    { nombre: 'SAMSUNG: Carry IN taller Monitor Gamer', valor: 16000 },
    { nombre: 'SAMSUNG: Garantía taller equipos pequeños', valor: 11000 },
    { nombre: 'SAMSUNG: Garantía TV IH (Carro Personal)', valor: 35000 },
    { nombre: 'SAMSUNG: Garantía TV IH (60" o más)', valor: 45000 },
    { nombre: 'SAMSUNG: Ayudantes', valor: 10000 },
    { nombre: 'SAMSUNG: Garantía SR TV', valor: 18000 },
    { nombre: 'SAMSUNG: Garantía TV almacén', valor: 25000 },
    { nombre: 'SAMSUNG: Garantía TV almacén (65" o más)', valor: 35000 },
    { nombre: 'SAMSUNG: Garantia hornos y torres almacén', valor: 15000 },
    { nombre: 'SAMSUNG: Garantía linea blanca almacén', valor: 20000 },
    { nombre: 'SAMSUNG: Garantia TV IH partes pequeñas', valor: 20000 },
    { nombre: 'SAMSUNG: Garantia TV IH partes pequeñas (65"/75" ayudante)', valor: 30000 },
    { nombre: 'SAMSUNG: Garantia TV IH partes pequeñas (desde 75")', valor: 50000 },
    { nombre: 'SAMSUNG: Garantía aire', valor: 35000 },
    { nombre: 'SAMSUNG: Diagnostico aire', valor: 20000 },
    { nombre: 'SAMSUNG: Garantía TV recogido almacén (barras)', valor: 47000 },
    { nombre: 'SAMSUNG: Reparación IH de barras led', valor: 38000 },
    { nombre: 'SAMSUNG: Garantía nevera', valor: 20000 },
    { nombre: 'SAMSUNG: Garantía lavadora', valor: 20000 },
    { nombre: 'SAMSUNG: Garantía lavadora (Tina Carga Frontal)', valor: 40000 },
    { nombre: 'SAMSUNG: Instalación nevera', valor: 15000 },
    { nombre: 'SAMSUNG: Instalación lavadora', valor: 10000 },
    { nombre: 'SAMSUNG: Instalación secadora', valor: 40000 },
    { nombre: 'SAMSUNG: Instalación lavavajillas', valor: 35000 },
    { nombre: 'SAMSUNG: Instalación combo 2 en 1', valor: 60000 },
    { nombre: 'SAMSUNG: Instalación de bespoke', valor: 25000 },
    { nombre: 'SAMSUNG: Instalación combo (Panel/Puerta)', valor: 60000 },
    { nombre: 'SAMSUNG: Instalación combo (Panel + Puerta)', valor: 75000 },
    { nombre: 'SAMSUNG: Instalación combo (Solo inicial)', valor: 15000 },
    { nombre: 'SAMSUNG: Instalación combo (Solo sentido puerta)', valor: 15000 },
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
    { nombre: 'SAMSUNG: Eco Repair transportadora/Carry IN', valor: 26000 },
    { nombre: 'SAMSUNG: Eco repair almacenes', valor: 33000 },
    { nombre: 'SAMSUNG: Limpieza partículas pantalla', valor: 30000 },
    { nombre: 'SAMSUNG: Facturado Panel 75"', valor: 75000 },
    { nombre: 'SAMSUNG: Facturado panel 58" para abajo', valor: 55000 },
    
    // Traslados BGA
    { nombre: 'TRASLADO: Piedecuesta', valor: 6000 },
    { nombre: 'TRASLADO: Giron', valor: 3000 },
    { nombre: 'TRASLADO: Lebrija', valor: 8000 },
    { nombre: 'TRASLADO: Los Santos', valor: 25000 },
    { nombre: 'TRASLADO: Rionegro-Playon', valor: 30000 },
    { nombre: 'TRASLADO: Pescadero', valor: 25000 },
    { nombre: 'TRASLADO: Zapatoca', valor: 60000 },
    { nombre: 'TRASLADO: Curos', valor: 12000 },
    { nombre: 'TRASLADO: Sogamoso', valor: 35000 },
    { nombre: 'TRASLADO: Matanza', valor: 25000 },
    { nombre: 'TRASLADO: Acapulco', valor: 9000 },
    { nombre: 'TRASLADO: San Vicente', valor: 75000 },

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

    // Diagnóstico de TV disponible para todas las marcas.
    ...(['SAMSUNG', 'HISENSE', 'HYUNDAI', 'TCL', 'ZURICH'] as const).map((marca) => ({
      nombre: `${marca}: Diagnóstico TV`,
      valor: 10000,
    })),

    // Hyundai y TCL: catálogo exclusivo para TV, con las tarifas Samsung actuales.
    ...(['HYUNDAI', 'TCL'] as const).flatMap((marca) =>
      [
        { servicio: 'Carry IN taller TV', valor: 18000 },
        { servicio: 'Garantía TV IH (Carro Personal)', valor: 35000 },
        { servicio: 'Garantía TV IH (60" o más)', valor: 45000 },
        { servicio: 'Garantía SR TV', valor: 18000 },
        { servicio: 'Garantía TV almacén', valor: 25000 },
        { servicio: 'Garantía TV almacén (65" o más)', valor: 35000 },
        { servicio: 'Garantía TV IH partes pequeñas', valor: 20000 },
        { servicio: 'Garantía TV IH partes pequeñas (65"/75" ayudante)', valor: 30000 },
        { servicio: 'Garantía TV IH partes pequeñas (desde 75")', valor: 50000 },
        { servicio: 'Garantía TV recogido almacén (barras)', valor: 47000 },
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
        { servicio: 'Limpieza partículas pantalla', valor: 30000 },
        { servicio: 'Facturado Panel 75"', valor: 75000 },
        { servicio: 'Facturado panel 58" para abajo', valor: 55000 },
      ].map(({ servicio, valor }) => ({
        nombre: `${marca}: ${servicio}`,
        valor,
      })),
    ),
  ];

  console.log('🚀 Iniciando actualización de tarifas...');
  
  for (const t of tariffs) {
    await prisma.tipos_servicio.upsert({
      where: { nombre: t.nombre },
      update: {
        valor_estandar: t.valor,
        ...(t.nombre.endsWith(': Diagnóstico TV') ? { activo: true } : {}),
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
