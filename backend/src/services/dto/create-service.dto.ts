import { IsNotEmpty, IsString, IsOptional, Matches } from 'class-validator';

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
}
