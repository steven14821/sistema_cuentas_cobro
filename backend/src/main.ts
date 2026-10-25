import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create(AppModule);
  
  // Habilitar CORS para desarrollo y producción
  app.enableCors();

  // Validación global de DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // FORZAR puerto 3000 en producción para evitar colisión con Nginx (puerto 80)
  const port = process.env.NODE_ENV === 'production' ? 3000 : (parseInt(process.env.PORT ?? '', 10) || 3000);
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
}
bootstrap();
