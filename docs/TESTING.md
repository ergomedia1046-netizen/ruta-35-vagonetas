# Pruebas

## Ejecutar

Con Node.js 22 y PostgreSQL configurado: npm ci, npm run db:generate, npm run db:migrate, npm run typecheck, npm test y npm run build. GitHub Actions ejecuta migraciones contra PostgreSQL 16 y también npm audit.

## Casos unitarios actuales

tests/domain.test.ts cubre precio Bs 35, total de Bs 245 para siete, rechazo de ocho, expreso de siete asientos, asignación 5+2, capacidad, dirección, importes combinados y estados iniciales de pago.

## Cobertura pendiente

Aún hacen falta pruebas PostgreSQL concurrentes de sobreventa y doble aceptación; prioridad ciudad/carretera y orden de vehículos; pruebas de efectivo/QR dentro de transacciones; prueba de restricción combinada; permisos de conductor y acceso a reservas ajenas; auditoría de cancelaciones/correcciones; y pruebas de navegador para desconexión e idempotencia. No se afirma que estos escenarios estén verificados por mocks.
