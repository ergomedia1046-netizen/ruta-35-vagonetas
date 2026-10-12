# Plan de implementación

1. Arquitectura, estructura y documentación.
2. PostgreSQL, migraciones, sesiones, hash y permisos.
3. Vehículos, fila, reservas, tarifas, asignaciones y concurrencia.
4. Efectivo, QR, combinado, incidencias y auditoría.
5. Interfaces pasajero, conductor y administración.
6. Pruebas, análisis, CI y correcciones.
7. Despliegue, copias, recuperación y checklist.

## Estado comprobable

- Etapa 1: completa como documentación y estructura inicial.
- Etapa 2: parcial. Hay esquema/migración PostgreSQL, login Argon2id con sesión revocable, roles en las rutas y cuentas creadas por administración/bootstrap; falta gestión de cuentas completa, MFA y pruebas de seguridad.
- Etapa 3: parcial. Tarifas/capacidad, reservas idempotentes, confirmación, cola y asignación transaccional implementadas; falta verificar concurrencia real, reglas completas de carretera y manejo de estados de viaje.
- Etapa 4: parcial. Componentes efectivo/QR/combinado y revisión manual QR están en servicios; faltan incidentes, restricciones y pruebas de flujos integrados.
- Etapa 5: parcial. Interfaz pasajero y panel básico conductor; consola administrativa y pantallas de pagos incompletas.
- Etapa 6: parcial. Unit tests y CI con PostgreSQL. Esperando resultado del último workflow tras fijar dependencias; faltan tests de integración/E2E.
- Etapa 7: pendiente. Sin hosting, dominio, proveedor QR, backups de producción ni recuperación probada.

No desplegar en producción hasta completar las limitaciones anteriores y obtener CI verde.
