# https-github.com-tu-usuario-ruta-35-vagonetas
prueba de trufis

## Ruta 35: implementación inicial

Sistema web modular para reservas y despacho Yacuiba–Villamontes. Esta entrega establece el dominio transaccional inicial y la estructura de documentación; el resto de los flujos de producción se implementará por etapas.

### Desarrollo

Requiere Node.js 22 y PostgreSQL. Copia .env.example a .env, configura DATABASE_URL y SESSION_SECRET, luego ejecuta npm ci, npm run db:generate, npm run db:migrate, npm test y npm run build.

### Alcance actual

Se están implementando reglas de tarifa, capacidad, direcciones, concurrencia y estados de pago. No se considera lista para operación real hasta completar autenticación, interfaces, revisión de seguridad, backups y CI verde.
