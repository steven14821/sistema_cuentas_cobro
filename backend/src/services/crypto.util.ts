import * as crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'a359550c161ea19e320242d1215ed1ad2a36c1d23c59436145283f6e79fd0ebe';
const KEY = crypto.createHash('sha256').update(SECRET).digest();

export interface DatosCobro {
  banco: string;          // Siempre 'Bancolombia'
  numero_cuenta: string;  // Número de cuenta de ahorros
  nit: string;            // NIT o cédula con dígito si aplica (ej. 1097783287-1)
  telefono: string;       // Teléfono de contacto
  lugar_expedicion: string; // Ciudad - Departamento (ej. Girón – Santander)
}

export function encryptDatosCobro(datos: DatosCobro): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  let encrypted = cipher.update(JSON.stringify(datos), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptDatosCobro(payload: string): DatosCobro | null {
  try {
    const [ivHex, encHex] = payload.split(':');
    if (!ivHex || !encHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
    let decrypted = decipher.update(encHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted) as DatosCobro;
  } catch {
    return null;
  }
}
