# Arquitectura de Ruta 35

## Estado implementado

Monolito TypeScript con API REST Fastify, páginas estáticas servidas desde el mismo origen, PostgreSQL y Prisma. Esta estructura evita CORS entre interfaz y API. No hay integración externa ni servicios contratados.

## Componentes

- Interfaz adaptable en public/index.html para pasajero, conductor y administración básica.
- Backend Node.js 22/Fastify con validación Zod.
- PostgreSQL persistente; esquema y migración inicial en prisma/.
- Contraseñas Argon2id; sesiones opacas aleatorias persistidas como hash, cookies HttpOnly/SameSite Strict y Secure en producción.
- Roles PASSENGER, DRIVER y ADMIN comprobados en endpoints.
- CI con PostgreSQL 16, lockfile npm, generación y migración Prisma, TypeScript, Vitest, build y auditoría npm.

## Concurrencia y asignación

La asignación corre en transacción Serializable, bloquea primero la solicitud y luego el vehículo mediante SELECT FOR UPDATE y recalcula reservas asignadas/capacidad en la transacción. Booking.idempotencyKey y Assignment.bookingId son únicos. La asignación requiere estado CONFIRMED y dirección compatible; solicitudes pendientes no consumen capacidad. Se consideran la hora de confirmación para solicitudes compatibles y la hora/posición de cola para elegir vehículo. Pruebas de integración PostgreSQL ejercitan sobreventa, reclamo concurrente y 5+2.

La compatibilidad de recogidas de carretera y múltiples paradas todavía se reduce a dirección y punto de recogida; requiere especificación operacional de la asociación.

## Modelo de datos

User, Session, Vehicle, DriverShift, QueueEntry, Booking, Assignment, Payment, PaymentPart y AuditEvent. El dinero se guarda como entero Bs. El total se congela en la reserva. Capacidad fija siete. El modelo no contiene aún la configuración versionada de tarifas, Incidents/Restrictions ni endpoints completos para errores/correcciones.

## Pago

QR y efectivo mantienen partes y estados separados. El efectivo lo confirma el conductor asignado al registrar recepción. QR solo puede marcarse pagado por revisión manual de administrador y queda auditada. No existe pasarela QR. Las restricciones a pago combinado e incidencias aún no están desarrolladas.

## Seguridad y límites

Las sesiones duran 12 horas; login limitado a cinco intentos por minuto. Sesiones expiradas se rechazan, pero falta tarea de limpieza. La interfaz/API está same-origin y CORS no está habilitado. Falta protección CSRF dedicada, MFA, rate limits en todas las acciones sensibles, revisión independiente y pruebas de acceso exhaustivas.

## Operación

El servicio necesita variables de entorno y PostgreSQL. Backups, alertas, alojamiento, dominio y restauración son decisiones pendientes. Consulte DEPLOYMENT.md.
