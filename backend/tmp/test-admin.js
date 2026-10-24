const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('1) login admin...');
  const login = await post('/auth/login', { email: 'admin@em.com', password: 'password123' });
  console.log('   accessToken:', login.accessToken?.substring(0, 30) + '...');
  const token = login.accessToken;

  console.log('2) list users...');
  const users = await post('/admin/users', null, token);
  console.log('   count:', Array.isArray(users) ? users.length : 'n/a');
  if (Array.isArray(users)) {
    users.forEach((u) => console.log('   -', u.username, '|', u.email, '|', u.rol, '|', u.activo));
  }

  console.log('3) create user...');
  const created = await post('/admin/users', {
    username: 'nuevoTecnico',
    nombre_completo: 'Pedro Gómez',
    email: 'pedro@em.com',
    password: '123456',
    rol: 'Tecnico',
  }, token);
  console.log('   created:', created);

  console.log('4) list users after create...');
  const users2 = await post('/admin/users', null, token);
  console.log('   count:', Array.isArray(users2) ? users2.length : 'n/a');
  if (Array.isArray(users2)) {
    users2.forEach((u) => console.log('   -', u.username, '|', u.email, '|', u.rol, '|', u.activo));
  }
}

run().catch((e) => console.error('ERROR:', e.message));
