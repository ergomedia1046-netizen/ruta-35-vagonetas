# Pruebas

Pruebas unitarias del dominio están en tests/domain.test.ts. La lógica de servicios requiere pruebas de integración contra PostgreSQL, especialmente bloqueos y aislamiento Serializable. Estas aún no se han añadido ni ejecutado.

Matriz obligatoria:
- Tarifas: uno Bs 35; siete Bs 245; ocho rechazados; expreso ocupa siete.
- Asignación: 5+2 completa; exceso rechazado; dirección incompatible; prioridad ciudad/carretera; sin sobreventa concurrente; aceptación doble con ganador único.
- Pagos: QR pendiente hasta verificación administrativa; efectivo pendiente hasta recepción; combinado 30+5 válido para 35; suma incorrecta rechazada; restricción no bloquea otros métodos.
- Seguridad: conductor sin administración; reserva protegida por propiedad; cancelaciones y correcciones auditables.

CI ejecutará formato, lint, tipos, pruebas, compilación y auditoría de dependencias. Los flujos aún requieren pruebas reales de PostgreSQL antes de producción.