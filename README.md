# Ruta 35

Aplicación en desarrollo para reservas y despacho en la ruta Yacuiba–Villamontes.

## Estado

La rama main contiene un MVP de backend Fastify/TypeScript, PostgreSQL/Prisma, sesiones con cookies, reglas del dominio, interfaz adaptable para pasajeros y vistas operativas básicas del conductor. No está lista para operación real: faltan administración web, gestión completa de tarifas y recargos, incidencias/restricciones, integración QR, pruebas concurrentes e integración completa de flujos.

## Requisitos y arranque local

Se requiere Node.js 22 o posterior y PostgreSQL 16 o compatible. Configure las variables de entorno desde un gestor local de secretos o desde el shell; la aplicación no carga archivos .env automáticamente.

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run typecheck
npm test
npm run build
```

Para crear la primera cuenta de administración, la base debe estar vacía. Configure RUTA35_BOOTSTRAP_EMAIL y RUTA35_BOOTSTRAP_PASSWORD (mínimo 14 caracteres) en el entorno, y ejecute npm run bootstrap:admin. El comando se niega si ya existe cualquier cuenta. Luego inicie con npm run start.

## Funcionalidad disponible

- Cotizador ordinario (Bs 35 por pasajero) y expreso (Bs 245 por siete asientos).
- Alta de solicitudes autenticadas con clave de idempotencia, consulta por propietario y cancelación solo mientras están pendientes.
- Confirmación administrativa y asignación transaccional con capacidad, dirección, prioridad temporal compatible y orden de fila.
- Alta administrativa de usuarios, vehículos, cola y turnos.
- Recepción de efectivo por el conductor del vehículo asignado; revisión administrativa manual del QR, nunca por captura de pantalla.
- Reporte de incumplimiento combinado, revisión administrativa, restricción solo para ese método después de una revisión favorable y corrección auditada que puede revertirla.
- Interfaz web de pasajero y panel básico de conductor; operaciones del conductor advierten que se hagan con el vehículo detenido.

## Verificaciones

GitHub Actions usa PostgreSQL de servicio, npm ci, migración, generación Prisma, TypeScript, Vitest, build y npm audit. Consulte el estado más reciente del workflow antes de usar. Las pruebas actuales cubren reglas del dominio; faltan pruebas de integración concurrente.

## Documentación

Consulte docs/ARCHITECTURE.md, docs/BUSINESS_RULES.md, docs/SECURITY.md, docs/TESTING.md y docs/DEPLOYMENT.md. No se ha configurado un proveedor QR ni infraestructura de despliegue. Los recargos deben aprobarse antes de activarse; Bs 2, 5 y 10 no son tarifas oficiales.
