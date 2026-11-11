import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/guards/roles.decorator';

@Controller('admin/assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class AdminAssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  chat(@Body() dto: AssistantChatDto) {
    return this.assistantService.chat(dto);
  }

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: 4 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        if (!file.mimetype.startsWith('audio/')) {
          callback(new BadRequestException('El archivo debe ser un audio válido.'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  transcribe(
    @UploadedFile()
    file?: { buffer: Buffer; mimetype: string },
  ) {
    return this.assistantService.transcribe(file);
  }
}
