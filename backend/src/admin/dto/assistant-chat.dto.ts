import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AssistantChatDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  message: string;

  @IsOptional()
  @IsObject()
  previousQuery?: Record<string, unknown>;
}
