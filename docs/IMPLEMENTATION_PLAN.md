# Plan de implementación

1. Arquitectura, estructura y decisiones. Salida: documentación revisada y pendientes identificados.
2. PostgreSQL, migraciones, sesiones, hash y roles. Salida: pruebas de rol y propiedad.
3. Vehículos, fila, reservas, tarifas y asignación transaccional. Salida: capacidad, dirección, prioridad e idempotencia concurrentes verificadas.
4. Efectivo, QR manual o integrado, combinado e incidentes. Salida: pagos parciales independientes y auditoría.
5. Interfaces conectadas a API, móviles y con señal de desconexión.
6. Pruebas, análisis, CI y correcciones. Salida: CI verde y escenarios cubiertos.
7. Despliegue, backups, monitoreo, recuperación y checklist.

## Estado
Etapa 1: documentos iniciales y estructura técnica publicados. Etapa 2: esquema de persistencia y base de reglas implementados parcialmente; autenticación y permisos pendientes. Etapas 3–7 pendientes. No declarar pasarela integrada o producción lista sin verificaciones.
