const old = process.platform === 'win32'
  ? 'node "D:/sistema_cuentas_cobro/frontend/node_modules/vite/bin/vite.js" --host 0.0.0.0 --port 5173'
  : 'vite --host 0.0.0.0 --port 5173';

const wanted = 'node "D:/sistema_cuentas_cobro/frontend/node_modules/.bin/vite" --host 0.0.0.0 --port 5173';

// Replacement map for dev-server startup commands.
module.exports = { old, wanted };
// Note: file exists at workspace root frontend/tmp/dev-cmd.cjs
