import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';
import { ServicesModule } from './services/services.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [PrismaModule, AuthModule, ServicesModule, AdminModule],
  controllers: [SeedController],
  providers: [SeedService],
})
export class AppModule {}
