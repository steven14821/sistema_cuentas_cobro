import { IsUUID } from 'class-validator';

export class UpdateServiceTypeDto {
  @IsUUID()
  tipo_servicio_id!: string;
}
