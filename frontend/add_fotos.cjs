const fs = require('fs');
const path = './src/pages/admin/AccountDetailPage.tsx';
let s = fs.readFileSync(path, 'utf8');
const old = `export interface AccountService {\n  id: string;\n  cuenta_cobro_id: string;\n  tipo_servicio_id: string;\n  tipo_servicio_nombre?: string | null;\n  numero_orden: string;\n  descripcion_especifica?: string | null;\n  valor_cobrado: number;\n  estado: EstadoServicio;\n  created_at?: string;\n  auditoria?: AuditEntry[];\n}`;
const neu = `export interface AccountService {\n  id: string;\n  cuenta_cobro_id: string;\n  tipo_servicio_id: string;\n  tipo_servicio_nombre?: string | null;\n  numero_orden: string;\n  descripcion_especifica?: string | null;\n  valor_cobrado: number;\n  estado: EstadoServicio;\n  created_at?: string;\n  auditoria?: AuditEntry[];\n  fotos?: string[] | null;\n  extras?: any;\n}`;
if (!s.includes('fotos?:') && s.includes(old)) {
  s = s.replace(old, neu);
  fs.writeFileSync(path, s);
  console.log('done');
} else {
  console.log('skip');
}
