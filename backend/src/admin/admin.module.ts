import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ApprovalEmailService } from './approval-email.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService, ApprovalEmailService],
})
export class AdminModule {}
