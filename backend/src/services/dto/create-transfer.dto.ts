import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Matches,
} from 'class-validator';

/**
 * Payload para crear un traslado.
 *
 * Reglas actuales del negocio (simplificadas para el registro por servicio):
 * - `transporte` determina si el traslado es `MOTO_PROPIA` o `VEHICULO_EMPRESA`.
 * - `destino` se usa para:
 *     - identificar la tarifa fija por lugar (moto propia), o
 *     - discriminatorio del cálculo de ruta (vehículo empresa: Pamplona / mixto Pamplona,
 *       Chinácota / Durania / Bochalema con base 50k + 20k por servicio, etc.).
 * - `valor_cobrado` es el valor que se registrará en `servicios`. Debe coincidir con el
 *   cálculo que hace el backend para el caso correspondiente.
 */
export class CreateTransferDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-zA-Z0-9_\-]+$/, {
    message:
      'El destino debe ser un identificador simple (ej. PAMPLONA, ZULIA, CHINACOTA).',
  })
  destino: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^((T-)?(BUC|CUC)-)?\d{5}$/i, {
    message:
      'El número de orden debe contener exactamente 5 dígitos numéricos.',
  })
  numero_orden: string;

  @IsOptional()
  @IsString()
  descripcion_especifica?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_cobrado?: number;

  @IsNotEmpty()
  @IsString()
  transporte: 'MOTO_PROPIA' | 'VEHICULO_EMPRESA';

  @IsNotEmpty()
  @IsString()
  tipo_servicio_id: string;
}
