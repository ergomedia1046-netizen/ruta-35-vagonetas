# Ruta 35

Aplicación en desarrollo para reservas y despacho en la ruta Yacuiba–Villamontes.

## Estado

La rama main contiene un MVP de backend Fastify/TypeScript, PostgreSQL/Prisma, sesiones seguras, reservas, pagos manuales, asignación de vagonetas e interfaces de pasajero, conductor y administración. Incluye un Blueprint Render gratuito para una instalación web temporal marcada como entorno de pruebas. No está habilitada para operación real.

## Requisitos y arranque local

Se requiere Node.js 22 y PostgreSQL 16 o compatible. Configure las variables de entorno desde un gestor local de secretos o desde el shell; la aplicación no carga archivos .env automáticamente.

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run typecheck
npm test
npm run build
```

Para despliegue temporal gratuito, sigue [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) y el Blueprint render.yaml. En el entorno de pruebas se crean pasajeros ficticios con correo @example.test; el administrador crea las cuentas de conductor y administración. El bootstrap inicial solo crea el admin cuando la tabla está vacía.

## Funcionalidad disponible

- Cotizador ordinario (Bs 35 por pasajero) y expreso (Bs 245 por siete asientos).
- Alta de solicitudes autenticadas con clave de idempotencia, consulta por propietario y cancelación solo mientras están pendientes.
- Confirmación administrativa y asignación transaccional con capacidad, dirección, prioridad temporal compatible y orden de fila.
- Alta administrativa de usuarios, vehículos, cola y turnos.
- Recepción de efectivo por el conductor del vehículo asignado; revisión administrativa manual del QR, nunca por captura de pantalla.
- Reporte de incumplimiento combinado, revisión administrativa, restricción solo para ese método después de una revisión favorable y corrección auditada que puede revertirla.
- Interfaz web de pasajero, panel básico de conductor y administración; en modo prueba muestra avisos y etiqueta todos los pagos como simulados.

## Verificaciones

GitHub Actions usa PostgreSQL de servicio, npm ci, generación Prisma, migración, comprobación TypeScript, Vitest, build y npm audit. Consulte [Actions](https://github.com/ergomedia1046-netizen/ruta-35-vagonetas/actions) antes de usar. La interfaz y el backend se sirven desde el mismo origen.

## Documentación

Consulte docs/ARCHITECTURE.md, docs/BUSINESS_RULES.md, docs/SECURITY.md, docs/TESTING.md y docs/DEPLOYMENT.md. No hay proveedor QR real: el modo de prueba es solo manual y no transmite pagos. Render Free es temporal y su PostgreSQL expira a los 30 días. Los recargos deben aprobarse antes de activarse; Bs 2, 5 y 10 no son tarifas oficiales.
