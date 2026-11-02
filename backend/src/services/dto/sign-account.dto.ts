import { IsString, Matches, MaxLength } from 'class-validator';

export class SignAccountDto {
  @IsString()
  @MaxLength(1_000_000)
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, {
    message: 'La firma debe ser una imagen PNG válida.',
  })
  firma_tecnico!: string;
}
