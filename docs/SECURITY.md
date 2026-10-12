# Seguridad y limitaciones

## Controles implementados

- Contraseñas Argon2id; login limitado a cinco intentos por minuto.
- Sesiones opacas aleatorias almacenadas como SHA-256, expiración 12 h, revocación y cookie HttpOnly/SameSite Strict; Secure en producción.
- Control de roles y propiedad en backend; reserva creada con clave de idempotencia única.
- Asignación serializable con bloqueo de filas y capacidad recalculada en servidor.
- Auditoría de altas, confirmaciones, asignaciones, cobros, revisión de pagos, incidentes, restricciones, correcciones y estados de vehículos.
- QR solo se valida con acción de revisión administrativa manual, no con captura.
- Restricción combinada solo después de revisión substantiated; no bloquea efectivo ni QR. Corrección auditable la puede revertir.
- Auditoría de usuario omite email. Incidentes no se identifican por teléfono.
- Dependencias fijadas con package-lock y audit CI.

## Pendiente antes de producción

MFA administrativa, protección CSRF dedicada, límites de frecuencia para todas las operaciones sensibles, limpieza de sesiones expiradas, revisión de seguridad independiente y pruebas de autorización exhaustivas. La interfaz y API son same-origin; CORS no está habilitado. Configurar TLS, secretos, logs, monitorización y backups cifrados al desplegar.

Los datos de incidentes son sensibles y deben estar disponibles solo para administradores autorizados. No almacenar evidencias de pago como capturas. No se ha configurado proveedor QR.
