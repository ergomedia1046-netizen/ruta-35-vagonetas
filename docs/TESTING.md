# Pruebas

## Comandos

Con PostgreSQL configurado: npm ci, npm run db:generate, npm run db:migrate, npm run typecheck, npm test, npm run build y npm audit. El workflow de GitHub Actions ejecuta estos pasos con PostgreSQL 16 y el lockfile comprometido.

## Cobertura

- tests/domain.test.ts: Bs 35 por pasajero, Bs 245 para siete, rechazo de ocho, expreso de siete asientos, 5+2, sobrecapacidad, dirección, partes combinadas y estados de pago.
- tests/dispatch.integration.test.ts: con DATABASE_URL, contra PostgreSQL real, prueba 5+2 y bloqueo de asiento adicional, doble reclamación simultánea de una reserva y dos solicitudes de cuatro asientos compitiendo por siete. Se verifica ganador único y ocupación no superior a siete.

## Pendiente

Faltan pruebas de integración para login/roles, propiedad de reservas, limitación de intentos, verificación QR, efectivo, restricciones de pago combinado, auditoría de cancelación/corrección, recorrido de cola y compatibilidad real de recogida. No hay todavía pruebas E2E de navegador. No afirmar cobertura de producción hasta completar estos escenarios.
