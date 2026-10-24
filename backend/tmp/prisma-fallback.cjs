'use strict';

// Matched Prisma model name taken from prisma/schema.prisma.
const matchedModelName = 'excepciones';

// Name used historically in this codebase (present in schema.usuarios_excepciones_carga_usuario_idTousuarios relation and migration file).
const historicalName = 'excepciones_carga';

// Fallback decision: prefer the matched Prisma model name when both appear in the schema.
// If only the historical name appears, use it instead.
module.exports = {
  matchedModelName,
  historicalName,
  // Use this in service code: prisma.matchedModelName.findFirst(...)
  effectivePrismaAccessor: matchedModelName,
};

if (require.main === module) {
  console.log(JSON.stringify({ effectivePrismaAccessor: module.exports.effectivePrismaAccessor }));
}
