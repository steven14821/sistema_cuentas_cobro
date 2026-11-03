import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1_400_000, { each: true })
  fotos?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  puertas_desmontadas?: number;

  @IsOptional()
  @IsBoolean()
  requiere_ayudante?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo_ayudante?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+$/)
  destino?: string;

  @IsOptional()
  @IsIn(['MOTO_PROPIA', 'VEHICULO_EMPRESA'])
  transporte?: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA';
}
