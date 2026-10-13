# Flujo de viaje del conductor

El viaje se registra en `Trip`, separado del estado operativo del vehículo (`AVAILABLE`, `QUEUED`, `ON_TRIP`, `INACTIVE`). Cada transición crea un `TripEvent` inmutable con actor, estado anterior y nuevo, hora y clave de idempotencia. La auditoría `VEHICLE_STATUS_CHANGED` histórica permanece sin cambios.

## Estados y acciones

| Estado del viaje | Acción del conductor | Efecto del vehículo |
| --- | --- | --- |
| `ASSIGNED` | Ir a recoger | Desactiva la fila de origen y pone el vehículo `ON_TRIP`. |
| `TO_PICKUP` | Confirmar recogida | Registra pasajeros abordados por reserva; no altera plazas reservadas, tarifa ni pagos. |
| `PICKED_UP` | Iniciar viaje | Registra el inicio del trayecto. |
| `IN_TRANSIT` | Confirmar llegada | Registra `ARRIVED` y completa las reservas; el vehículo sigue `ON_TRIP`. |
| `ARRIVED` | Estoy disponible | Registra `COMPLETED` y cambia el vehículo a `AVAILABLE`. |
| `COMPLETED` | Unirme a la fila de [ciudad] | Acción separada y voluntaria; asigna el último lugar de la fila inversa. |

El conteo real por reserva no puede exceder su cantidad reservada ni la capacidad del vehículo. En un expreso se mantienen los siete asientos reservados y Bs 245 aunque suban menos personas.

## Pagos independientes

`Registrar efectivo recibido` permanece disponible para las reservas terminadas que todavía tienen una parte pendiente. Se muestran en `pendingPayments` del resumen del chofer, sin contar sus plazas como ocupadas. Registrar el efectivo no avanza el viaje ni cambia el vehículo. Cada pago se bloquea durante su registro: las repeticiones devuelven el recibo existente y generan un único evento `CASH_RECEIVED`. La revisión QR comparte ese bloqueo para calcular correctamente `PARTIAL` o `PAID` en pagos combinados concurrentes.

## API móvil

- `GET /api/v1/driver/overview`: devuelve el turno, reservas, viaje actual y eventos.
- `POST /api/v1/driver/trips/:id/actions`: acciones `GO_TO_PICKUP`, `CONFIRM_PICKUP`, `START_TRIP`, `CONFIRM_ARRIVAL` o `MARK_AVAILABLE`; exige token DRIVER y `Idempotency-Key`.
- `POST /api/v1/driver/trips/:id/join-destination-queue`: incorporación voluntaria al final de la fila del destino; exige token DRIVER y `Idempotency-Key`.
- `GET /api/v1/bookings`: incluye vehículo, matrícula, ocupación real y eventos del viaje propio del pasajero.

Las acciones se serializan bloqueando el viaje. La cola de destino usa bloqueo transaccional por sentido para evitar posiciones duplicadas. El endpoint antiguo de cambio genérico de estado queda limitado a ADMIN y no puede alterar un vehículo que tenga un viaje abierto.

## Migración de datos existentes

La migración solo crea viajes iniciales para reservas `ASSIGNED` cuando el vehículo sigue `QUEUED` en la fila activa del mismo sentido. No infiere la fase de vehículos `ON_TRIP` ni reescribe auditorías anteriores. Las asignaciones antiguas restantes conservan sus datos y su trazabilidad de auditoría, pero no reciben un estado de viaje inventado.

## Despliegue y compilaciones

Aplicar la migración y desplegar el backend antes de distribuir APK actualizados. Los APK anteriores no conocen las rutas nuevas. Pasajeros necesita actualización para mostrar matrícula y cronología; Choferes requiere actualización para las acciones del flujo. La migración debe ejecutarse primero en un backend separado de pruebas y validarse allí antes de cualquier publicación.
