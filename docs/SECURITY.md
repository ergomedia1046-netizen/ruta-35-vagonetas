# Seguridad y limitaciones

## Implementado parcialmente

- Contraseñas con Argon2id; login limitado a cinco intentos por minuto.
- Sesiones aleatorias opacas con hash SHA-256 persistido, expiración de 12 horas, revocación y cookie HttpOnly/SameSite Strict; Secure en producción.
- Guardas de roles en backend, consulta de reservas filtrada por propietario y clave de idempotencia única.
- Asignaciones serializables con bloqueo de filas; capacidad recalculada en el servidor.
- Auditoría para altas, confirmaciones, asignaciones, pagos y cambios de vehículo. Logs redactan cookies y autorización.
- Dependencias directas fijadas y lockfile para instalación repetible.

## Pendiente antes de producción

No se ha realizado evaluación de seguridad independiente. Faltan protección CSRF explícita y política CORS/orígenes, MFA administrativo, rate limits para todas las acciones sensibles, política de retención/eliminación, monitoreo, rotación/revocación de sesiones expiradas y revisión de amenazas. No existen aún flujos/incidencias con privacidad reforzada ni pruebas de autorización exhaustivas.

El QR no se valida mediante captura: solo puede marcarse verificado por una acción administrativa manual auditada hasta que se configure un proveedor. No se almacenan credenciales ni secretos de proveedor en la aplicación. No registrar información personal sensible en logs.
