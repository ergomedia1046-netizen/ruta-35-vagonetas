# Despacho manual de pruebas

El despacho manual se ofrece exclusivamente al administrador del servicio Android aislado. La API exige simultáneamente `RUTA35_TEST_MODE=true`, `RUTA35_TEST_TARGET=ruta35-android-pruebas` y `RUTA35_TEST_MANUAL_DISPATCH=true`. La ruta normal `POST /api/v1/driver/assignments` conserva su control de fila.

La nueva ruta `/api/v1/admin/test-dispatch/:bookingId/assign` requiere ADMIN, reserva CONFIRMED sin asignar, motivo de al menos ocho caracteres, turno vigente de un chofer activo, vehículo QUEUED de siete asientos y entrada activa en la fila del sentido solicitado. La transacción bloquea la reserva y el vehículo, comprueba capacidad/dirección y estado, crea una sola asignación, actualiza la reserva y deja el bypass y su justificación en auditoría. El expreso debe ser de siete plazas por Bs 245.

## Desplegar en el servicio de pruebas

1. Integra el commit de esta rama en el PR y espera CI.
2. En Render, abre solo el servicio `ruta35-android-pruebas` y sincroniza el Blueprint `render.yaml` para incorporar las dos variables de entorno de despacho. El manifiesto mantiene `autoDeploy: false`, por lo que publicar el commit en GitHub no cambia Render.
3. Inicia el despliegue manual del servicio. El comando de inicio aplica migraciones antes de arrancar. No cambies `DATABASE_URL`; el servicio conserva su conexión actual a Neon de pruebas.
4. Comprueba `/health` y `/api/v1/config`; la respuesta esperada es `testMode: true` y `manualDispatchEnabled: true`. En otro servicio la ruta administrativa responde 404.

## Probar el flujo

1. Inicia sesión en el portal con una cuenta PASSENGER ficticia y crea la reserva. Debe aparecer PENDING.
2. Cierra sesión y entra con la cuenta ADMIN. En Administración confirma la reserva; debe pasar a CONFIRMED.
3. Abre **Despacho de pruebas**, selecciona la reserva y pulsa **Ver conductores compatibles**. La lista requiere vehículo en fila en el mismo sentido, turno activo, siete asientos de capacidad y espacio suficiente. La etiqueta “conectado recientemente” depende de un heartbeat de hasta dos minutos; “disponible” se calcula por separado.
4. Selecciona un vehículo. Para probar una posición posterior a la primera, escribe una justificación específica. Pulsa **Asignar viaje en pruebas**. El panel y la auditoría muestran el vehículo, la posición, si se saltó la prioridad y el motivo. La reserva cambia a ASSIGNED.
5. En el APK de Choferes correspondiente al turno/vehículo, abre **Pasajeros y pagos** y pulsa **Actualizar**. La asignación aparece para el conductor seleccionado porque el endpoint de resumen ya lista sus reservas asignadas.
6. Entra de nuevo como pasajero y actualiza sus solicitudes. Debe ver ASSIGNED y la matrícula del vehículo.

La app de choferes necesita una compilación nueva para emitir heartbeats automáticos y mostrarse conectada recientemente. El APK anterior puede consultar asignaciones ya hechas al actualizar, pero no enviará presencia. Ninguna compilación Android ni despliegue a Render se ejecuta automáticamente con este cambio.
