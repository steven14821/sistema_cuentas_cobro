import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ImportedServiceDto {
  @IsUUID()
  tipo_servicio_id: string;

  @IsString()
  @Matches(/^\d{5}$/, {
    message: 'El número de orden debe contener exactamente 5 dígitos.',
  })
  numero_orden: string;

  @IsNumber()
  @Min(0)
  @Max(9_999_999_999.99)
  valor_cobrado: number;

  @IsBoolean()
  es_traslado: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descripcion_especifica?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  destino?: string;

  @IsOptional()
  @IsIn(['MOTO_PROPIA', 'VEHICULO_EMPRESA'])
  transporte?: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA';

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
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1_400_000, { each: true })
  fotos?: string[];
}
