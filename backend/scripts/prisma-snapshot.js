import * as fs from 'fs';
import * as path from 'path';

const prismaDir = path.resolve(process.argv[2] ?? 'prisma');
const schema = fs.readFileSync(path.join(prismaDir, 'schema.prisma'), 'utf8');

// Devuelve tablas y campos (complejos aplanados) que aparecen en el schema.
const tables = {};

let current = null;
let insideEnum = false;

for (const raw of schema.split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;

  const modelMatch = line.match(/^model\s+([A-Za-z0-9_]+)\s*\{/);
  const enumMatch = line.match(/^enum\s+([A-Za-z0-9_]+)\s*\{/);

  if (enumMatch) {
    insideEnum = true;
    current = enumMatch[1];
    tables[current] = { columns: [], relations: [] };
    continue;
  }

  if (modelMatch) {
    insideEnum = false;
    current = modelMatch[1];
    tables[current] = { columns: [], relations: [] };
    continue;
  }

  if (current && line === '}') {
    current = null;
    continue;
  }

  if (!current) continue;

  const isRelation = /^(!?)[A-Za-z0-9_]+\s*:\s*(?:[\w]+\s*)?\1?(?:\??\s*)?@.*/.test(line) === false &&
    /^[A-Za-z0-9_]+\s*:\s*(?:@|[A-Za-z0-9_]+(,[\w]+)*\s*)$/.test(line) === false &&
    /^[A-Za-z0-9_]+\s+(prisma\.)?/.test(line) ||
    /^(?:\[.*\])?\s*[A-Za-z0-9_]+\s*:\s*(?:@prisma)?.*/.test(line);

  if (insideEnum) {
    tables[current].columns.push(line.replace(/[,;]$/, ''));
  } else if (isRelation) {
    tables[current].relations.push(line.replace(/[,;]$/, ''));
  } else {
    tables[current].columns.push(line.replace(/[,;]$/, ''));
  }
}

// Extraer nombres de campo (texto antes del ':').
function extractFields(entries) {
  return entries
    .map((e) => e.split(':')[0].trim())
    .filter(Boolean);
}

for (const [table, meta] of Object.entries(tables)) {
  console.log(`\n📄 ${table}`);
  const columns = extractFields(meta.columns);
  for (const col of columns) {
    const ann = meta.columns.find((c) => c.startsWith(col));
    const collection = ann?.split('@')[1]?.split('(')[0]?.trim();
    const isOptional = ann?.includes('?');
    let line = `  • ${col}`;
    if (isOptional || ann?.includes('NullOr')) line += ' (opcional)';
    else line += ' (requerido)';
    if (collection) line += `  → ${collection.replace(/^([^.]+)\./, '$1 → ')}`;
    console.log(line);
  }

  for (const rel of extractFields(meta.relations)) {
    const ann = meta.relations.find((r) => r.startsWith(rel));
    let via = '';
    if (ann?.includes('@relation(')) {
      const m = ann.match(/name:\s*"([^"]+)"/);
      via = m ? `  (via: ${m[1]})` : '';
    }
    console.log(`  ↳ ${rel}${via}`);
  }
}
