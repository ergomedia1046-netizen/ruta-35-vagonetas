# Plan de implementación

1. Arquitectura, estructura y documentación.
2. PostgreSQL, migraciones, sesiones, hash y permisos.
3. Vehículos, fila, reservas, tarifas, asignaciones y concurrencia.
4. Efectivo, QR, combinado, incidencias y auditoría.
5. Interfaces pasajero, conductor y administración.
6. Pruebas, análisis, CI y correcciones.
7. Despliegue, copias, recuperación y checklist.

## Estado verificado

- Etapa 1: completa para arquitectura y documentos iniciales.
- Etapa 2: parcial. Esquema/migración, login Argon2id, sesiones revocables y permisos; en modo de prueba, el alta pública solo crea pasajeros con correo `.test`. Faltan MFA, CSRF dedicado y cobertura completa de seguridad.
- Etapa 3: parcial. Tarifas base, reservas idempotentes, cola, confirmación, asignación serializable, orden compatible y capacidad; quedan por aprobar y codificar las reglas de paradas de carretera.
- Etapa 4: parcial. Efectivo, QR con revisión manual, combinado, incidentes, restricciones revisadas y corrección; no hay proveedor QR externo ni interfaz de conciliación automatizada.
- Etapa 5: parcial. Interfaz pasajero con registro de prueba, panel conductor y panel administrativo básico; faltan operación completa de turnos, informes y gestión integral de tarifas.
- Etapa 6: parcial. CI pasó en el commit de4f9761b63a760cebe5b91364a6bd69eb64d875: migraciones, tipos, 14 pruebas unitarias/de integración, build y npm audit. Siguen pendientes cobertura completa de seguridad, accesibilidad y E2E.
- Etapa 7: parcial. `render.yaml` configura Render Free y se documenta Neon Free como alternativa; todavía no existe un despliegue en vivo. Render requiere iniciar sesión y crear los recursos desde la cuenta del propietario; no se ingresaron credenciales ni datos de pago. La base gratuita Render vence a los 30 días y no tiene backups. Sin dominio comprado, proveedor QR real ni restauración ensayada.

La app sigue en desarrollo. No desplegar en producción hasta que el último CI esté verde, se aprueben reglas de negocio y se completen controles pendientes.
