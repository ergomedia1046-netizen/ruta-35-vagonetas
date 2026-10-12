# Arquitectura de Ruta 35

## Implementación

Monolito TypeScript: API REST Fastify, interfaz adaptable estática servida desde el mismo origen, PostgreSQL y Prisma. Zod valida entradas. No se necesita CORS para la arquitectura same-origin.

- Node.js 22, Fastify y PostgreSQL.
- Contraseñas Argon2id; sesiones opacas aleatorias, hash SHA-256 en base de datos, expiración de 12 h, cookies HttpOnly/SameSite Strict y Secure en producción.
- Roles PASSENGER, DRIVER y ADMIN.
- Migraciones SQL versionadas y CI con lockfile, PostgreSQL 16, typecheck, unit/integration tests, build y npm audit.

## Concurrencia y asignación

La asignación usa transacción Serializable, bloquea solicitud y vehículo mediante SELECT FOR UPDATE y recalcula cupos comprometidos. Assignment.bookingId e idempotencyKey son únicos. Solo solicitudes confirmadas consumen capacidad. Revisa dirección, capacidad de siete, prioridad temporal compatible y orden de fila. CI ejecuta pruebas PostgreSQL para 5+2, reclamo simultáneo y dos grupos de cuatro compitiendo por siete.

La viabilidad real de recogidas de carretera todavía se modela solo con dirección y punto, por lo que la asociación debe aprobar reglas de paradas antes de producción.

## Persistencia

User, Session, Vehicle, DriverShift, QueueEntry, Booking, Assignment, Payment, PaymentPart, Incident, PaymentRestriction y AuditEvent. Dinero se guarda como entero Bs y el total queda congelado por reserva. Recargos todavía no tienen consola de configuración versionada.

Las incidencias registran importe pendiente y reportante; revisión administrativa, restricción solo para COMBINED después de decisión substantiated y corrección auditada. La corrección revoca la restricción asociada.

## Pagos

QR permanece pendiente hasta revisión manual administrativa; no existe proveedor QR. Efectivo queda pendiente hasta confirmación del conductor en turno y vehículo asignado. Combinado valida suma exacta y estados parciales. La restricción aprobada solo bloquea el método combinado.

## Seguridad y límites

Login limitado a 5 intentos/minuto, sesión de 12 h, control de roles y propietario, logs redactados y auditoría de acciones. El bootstrap inicial solo crea cuenta si la tabla de usuarios está vacía.

Pendientes: MFA, protección CSRF dedicada, límites en todas las operaciones sensibles, limpieza automática de sesiones expiradas, revisión de seguridad independiente, compatibilidad completa de recogidas, políticas de retención y pruebas E2E. Backup, monitorización y hosting deben configurarse por la asociación.
