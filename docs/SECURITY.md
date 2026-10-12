# Seguridad y limitaciones

Previsto: Argon2id; sesiones revocables con cookies HttpOnly/Secure/SameSite; roles y propiedad en backend; validación; consultas parametrizadas; CSRF; CORS allowlist; rate limiting; auditoría financiera/administrativa; errores redactados; secretos en gestor externo.

Minimizar datos personales. No registrar contraseñas, tokens, teléfonos, capturas o datos sensibles. Incidentes limitados a administración. QR pagado solo tras verificación; revisión manual registra actor, fecha y resultado.

Estos son requisitos, no controles implementados. No operar en producción hasta implementar y verificar autenticación, permisos, transacciones, backups y pruebas.
