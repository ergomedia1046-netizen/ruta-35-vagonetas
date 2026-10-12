# Arquitectura propuesta

## Decisiones
- Monolito modular TypeScript, para reducir costo y complejidad transaccional.
- Frontend React + Vite adaptable; backend Node.js + Fastify, API REST versionada y validación de esquemas.
- PostgreSQL con Prisma y migraciones versionadas. SQLite no es adecuado para concurrencia de producción.
- Sesiones revocables almacenadas en PostgreSQL, cookies HttpOnly/Secure/SameSite y contraseñas Argon2id. MFA administrativo requerido antes de producción.
- Roles passenger, driver y admin; comprobar rol y propiedad en cada endpoint.
- Polling con ETag inicialmente; despliegue con un servicio web y PostgreSQL, Docker opcional.

## Concurrencia
Confirmación y asignación en transacción serializable o bloqueo de filas (SELECT FOR UPDATE). Restricción única para que una solicitud activa tenga como máximo una asignación. Recalcular en la transacción dirección, paradas compatibles y capacidad de siete. Pendientes no consumen capacidad. Persistir clave de idempotencia con índice único. Aceptación simultánea debe tener un ganador.

La cola se ordena por llegada registrada por servidor y secuencia estable. La compatibilidad ciudad/carretera y paradas requiere validación de la asociación.

## Modelo inicial
User (hash, rol, estado); Vehicle (capacidad fija 7); DriverVehicleShift; QueueEntry (llegada/dirección); Booking (pasajero, origen, destino, recogida, pasajeros, tipo, tarifas congeladas, estado, createdAt, confirmedAt, idempotencyKey); Assignment (booking único, vehículo, actor); Payment y PaymentPart (modalidad, importes y estados separados); Incident, Restriction y AuditEvent append-only.

Dinero en unidades enteras, nunca coma flotante. Recargos versionados y copiados a reservas. Bs 2, 5 y 10 son ejemplos, no tarifas oficiales.

## Seguridad y operación
TLS, CORS allowlist, CSRF, rate limits, consultas parametrizadas, límites de tamaño y errores redactados. Logs sin contraseñas, tokens, teléfonos ni datos sensibles. Acceso a incidentes limitado. Teléfono no prueba identidad ni culpabilidad. Backups cifrados y restauración probada. Cliente muestra desconexión y reintenta con la misma clave de idempotencia; no usa confirmación optimista.

## Pendientes
Proveedor QR o revisión manual; política de cancelación/reembolso/confirmación; viabilidad de recogida y múltiples paradas; tarifas aprobadas y retención de datos; hosting, dominio, correo y backups.
