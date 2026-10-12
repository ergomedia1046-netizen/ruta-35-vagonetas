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
- Etapa 2: parcial. Esquema/migración, login Argon2id, sesiones revocables y permisos de endpoints; faltan MFA, CSRF dedicado y cobertura completa de seguridad.
- Etapa 3: parcial. Tarifas base, reservas idempotentes, cola, confirmación, asignación serializable, orden compatible y capacidad; quedan por aprobar y codificar las reglas de paradas de carretera.
- Etapa 4: parcial. Efectivo, QR con revisión manual, combinado, incidentes, restricciones revisadas y corrección; no hay proveedor QR externo ni interfaz de conciliación automatizada.
- Etapa 5: parcial. Interfaz pasajero, panel conductor y panel administrativo básico; faltan operación completa de turnos, informes y gestión integral de tarifas.
- Etapa 6: parcial. El workflow CI pasó en el commit eee175ae40ecb2b8dd54f6329ad74a4c90e62e1a (migraciones, tipos, 12 pruebas unitarias/de integración, build y npm audit). Siguen pendientes cobertura completa de seguridad, accesibilidad y pruebas de interfaz.
- Etapa 7: pendiente. Sin hosting, dominio, proveedor QR, backups de producción ni restauración ensayada.

La app sigue en desarrollo. No desplegar en producción hasta que el último CI esté verde, se aprueben reglas de negocio y se completen controles pendientes.
