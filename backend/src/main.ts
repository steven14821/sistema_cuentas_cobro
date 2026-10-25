import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  dotenv.config();
  console.log('🚀 Starting bootstrap process...');
  
  try {
    const app = await NestFactory.create(AppModule);
    console.log('✅ NestFactory created app instance');
    
    // Habilitar CORS para desarrollo y producción
    app.enableCors();

    // Validación global de DTOs
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    // FORZAR puerto 3000 en producción para evitar colisión con Nginx (puerto 80)
    const port = process.env.NODE_ENV === 'production' ? 3000 : (parseInt(process.env.PORT ?? '', 10) || 3000);
    
    console.log(`📡 Attempting to listen on port: ${port}...`);
    await app.listen(port);
    console.log(`🚀 Application is successfully running on: http://localhost:${port}`);
  } catch (error) {
    console.error('❌ Critical error during bootstrap:', error);
    process.exit(1);
  }
}
bootstrap();
