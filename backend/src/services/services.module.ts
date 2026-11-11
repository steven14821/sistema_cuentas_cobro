import { Module } from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { TransportCalculatorService } from './transport-calculator.service';
import { AccountImportService } from './account-import.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ServicesController],
  providers: [ServicesService, TransportCalculatorService, AccountImportService],
  exports: [TransportCalculatorService],
})
export class ServicesModule {}
