import 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      nombre_completo: string;
      email: string;
      rol: 'Tecnico' | 'Admin';
    }
  }
}
