import { IsInt, Max, Min } from 'class-validator';

export class UpdateServiceValueDto {
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  valor_cobrado!: number;
}