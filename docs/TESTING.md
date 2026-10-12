# Pruebas

## Ejecución

Con PostgreSQL configurado: npm ci, npm run db:generate, npm run db:migrate, npm run typecheck, npm test, npm run build y npm audit. GitHub Actions ejecuta estos pasos con PostgreSQL 16 y lockfile.

## Cobertura actual

- tests/domain.test.ts: Bs 35/persona, siete Bs 245, ocho rechazados, expreso de siete asientos, 5+2, sobrecapacidad, dirección, suma combinada y estados de pago.
- tests/dispatch.integration.test.ts: en PostgreSQL real verifica 5+2 sin exceder siete, reclamo simultáneo con ganador único, dos solicitudes de cuatro asientos en carrera y restricción combinada solo después de revisión con posterior corrección/reversión.

## Prueba temporal en Render

Consulta [docs/DEPLOYMENT.md](DEPLOYMENT.md) para crear la instancia gratuita y cuentas ficticias. El registro web solo acepta direcciones terminadas en `.test` y siempre asigna rol de pasajero; el administrador crea los perfiles de conductor y administrador. Usa solo correos `.test`, placas `TEST-*` y puntos/referencias inventados con prefijo `PRUEBA:`. La API rechaza cuentas, placas y puntos que no cumplan estos formatos durante el modo de prueba. No registres nombres, teléfonos ni correos reales. Todos los estados de pago son simulados.

## Pendiente

La integración de autenticación comprueba registro de pasajero ficticio, rechazo fuera del modo de prueba, login y atributos Secure/HttpOnly/SameSite de la cookie. Faltan pruebas de permisos exhaustivas, propiedad de reservas, rate limit, pagos dentro de API, cola e incidencias bajo concurrencia y navegación completa. No hay pruebas E2E del navegador. No afirmar que está cubierta producción hasta completar los casos y recibir un CI verde tras el último cambio.
