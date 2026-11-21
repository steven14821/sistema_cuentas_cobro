import { IsUUID, IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateServiceTypeDto {
  @IsUUID()
  tipo_servicio_id!: string;

  @IsOptional()
  @IsString()
  destino?: string;

  @IsOptional()
  @IsIn(['MOTO_PROPIA', 'VEHICULO_EMPRESA'])
  transporte?: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA';
}
