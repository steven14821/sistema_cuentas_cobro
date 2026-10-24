const old = process.platform === 'win32'
  ? 'node "D:/sistema_cuentas_cobro/backend/node_modules/tsx/dist/cli.mjs" watch "D:/sistema_cuentas_cobro/backend/src/main.ts"'
  : 'npx tsx watch src/main.ts';

const wanted = 'node "D:/sistema_cuentas_cobro/backend/node_modules/.bin/tsx" watch src/main.ts';

// Replacement map for dev-server startup commands.
module.exports = { old, wanted };
