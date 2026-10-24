import { App } from '../src/app.module';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { TransportCalculatorService } from '../src/services/transport-calculator.service';
import { ServicesService } from '../src/services/services.service';
import { ServicesController } from '../src/services/services.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const app = await Test.createTestingModule({
    imports: [JwtModule.register({ global: true })],
    providers: [
      ConfigService,
      PrismaService,
      AuthService,
      TransportCalculatorService,
      ServicesService,
      ServicesController,
    ],
    controllers: [ServicesController],
  }).compile();

  const calculator = app.get(TransportCalculatorService);
  const service = app.get(ServicesService);

  console.log('TransportCalculator available.');
  console.log('ServicesService available.');

  const tipos = await prisma.tipos_servicio.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, valor_estandar: true },
  });
  console.log('Tipos de servicio activos:', tipos.map((t) => ({ id: t.id, nombre: t.nombre, valor: t.valor_estandar })));

  const cuentas = await prisma.cuentas_cobro.findMany({
    where: { radicada: false },
    select: { id: true, usuario_id: true, mes: true, anio: true, estado: true, radicada: true },
  });
  console.log('Cuentas sin radicar:', cuentas);

  if (cuentas.length > 0) {
    const cuenta = cuentas[0];
    console.log('Primera cuenta sin radicar:', cuenta);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error al conectar o consultar la base de datos:', err);
  process.exit(1);
});
