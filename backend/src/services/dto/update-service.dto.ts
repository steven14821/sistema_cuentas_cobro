import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  tipo_servicio_id?: string;

  @IsOptional()
  @IsString()
  @Matches(/^((BUC|CUC)-)?\d{5}$/i, {
    message: 'El número de orden debe contener exactamente 5 dígitos numéricos.',
  })
  numero_orden?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion_especifica?: string;
}
