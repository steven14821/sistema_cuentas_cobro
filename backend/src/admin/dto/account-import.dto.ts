import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { ImportedServiceDto } from '../../services/dto/imported-service.dto';

export class CreateAccountImportDto {
  @IsUUID()
  usuario_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => ImportedServiceDto)
  servicios: ImportedServiceDto[];
}
