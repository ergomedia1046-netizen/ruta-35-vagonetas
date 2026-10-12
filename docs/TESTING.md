# Pruebas

Se añadieron pruebas unitarias del dominio en tests/domain.test.ts. No se ejecutaron todavía desde este entorno. Matriz requerida:
- Tarifas: uno Bs 35; siete Bs 245; ocho rechazados; expreso ocupa siete.
- Asignación: 5+2 completa; exceso rechazado; dirección incompatible; prioridad ciudad/carretera; sin sobreventa concurrente; aceptación doble con ganador único.
- Pagos: QR pendiente hasta verificación; efectivo pendiente hasta recepción; combinado 30+5 válido para 35; suma incorrecta rechazada; restricción no bloquea otros métodos.
- Seguridad: conductor sin administración; reserva protegida por propiedad; cancelaciones y correcciones auditables.

Implementar unitarias, integración con PostgreSQL y UI para flujos críticos. CI ejecutará formato, lint, tipos, pruebas, compilación y auditoría de dependencias.
