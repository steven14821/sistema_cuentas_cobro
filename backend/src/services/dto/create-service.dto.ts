import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, ArrayMaxSize, Min } from 'class-validator';

export class CreateServiceDto {
  @IsNotEmpty()
  @IsString()
  tipo_servicio_id: string;

  // Acepta exactamente 5 dígitos numéricos (o prefijado con BUC/CUC)
  @IsNotEmpty()
  @IsString()
  @Matches(/^((BUC|CUC)-)?\d{5}$/i, {
    message: 'El número de orden debe contener exactamente 5 dígitos numéricos.',
  })
  numero_orden: string;

  @IsOptional()
  @IsString()
  descripcion_especifica?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1_400_000, { each: true })
  fotos?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1_400_000, { each: true })
  fotos_puertas?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(1_400_000, { each: true })
  fotos_ayudante?: string[];

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
}
