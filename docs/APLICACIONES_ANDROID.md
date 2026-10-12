# Aplicaciones Android de Ruta 35

Dos clientes React Native/Expo independientes comparten el paquete `packages/mobile-core` y el backend Fastify existente:

| Cliente | Directorio | Identificador Android | Rol requerido |
| --- | --- | --- | --- |
| Pasajeros | `apps/passenger` | `bo.ruta35.passenger` | `PASSENGER` |
| Choferes | `apps/driver` | `bo.ruta35.driver` | `DRIVER` |

El backend sigue siendo la autoridad para tarifas, reglas, asignaciones, estados y pagos. No se usan respuestas locales simuladas como confirmaciones. El cliente rechaza HTTP sin cifrar (excepto `localhost` para desarrollo). Ambos clientes detienen el acceso si `GET /api/v1/config` no devuelve `testMode: true`, para no enviar operaciones de prueba a un entorno operativo.

## Compatibilidad de autenticación

La sesión web original usa cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`. El almacenamiento de cookies de React Native no es uniforme. Se añadió `POST /api/v1/auth/native/login`: emite una clave aleatoria opaca de 256 bits por 12 horas, devuelve `Cache-Control: no-store`, y nunca devuelve cookie. El servidor guarda solo HMAC-SHA256 de la clave en la tabla `Session`. Las peticiones nativas envían `Authorization: Bearer ...`; el hook de autenticación valida expiración, cuenta activa y los mismos roles que la web. Logout elimina la sesión; la ruta de cookie web conserva su comportamiento.

La aplicación conserva el token y una clave idempotente de intento de reserva con Expo SecureStore/Android Keystore. Las claves privadas del servidor y credenciales PostgreSQL no están en el bundle. Configura el endpoint HTTPS del **backend separado de pruebas** al ejecutar o compilar.

## API existente y cobertura móvil

| Operación | Endpoint y método | Autorización |
| --- | --- | --- |
| Estado del ambiente | `GET /api/v1/config` | Público; apps requieren `testMode: true` |
| Registro pasajero ficticio | `POST /api/v1/auth/register` | Público solo con `RUTA35_TEST_MODE=true`; correo `*.test` |
| Inicio sesión nativo | `POST /api/v1/auth/native/login` | Público; contraseña; límite de intentos |
| Sesión actual / salida | `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` | Token Bearer |
| Cotización | `GET /api/v1/quote?passengers=1&kind=ORDINARY` | Público |
| Crear reserva | `POST /api/v1/bookings` con `Idempotency-Key` | `PASSENGER` |
| Historial / cancelar pendiente | `GET /api/v1/bookings`, `POST /api/v1/bookings/:id/cancel` | Dueño con rol `PASSENGER` |
| Turno, vehículo, solicitudes, pasajeros y pagos asignados | `GET /api/v1/driver/overview` | `DRIVER` |
| Aceptar y asignar | `POST /api/v1/driver/assignments` | `DRIVER` (turno/vehículo verificados por servicio) |
| Cambiar estado de vehículo | `POST /api/v1/driver/vehicles/:id/status` | `DRIVER` del turno o `ADMIN`; transición restringida |
| Registrar efectivo recibido | `POST /api/v1/payments/:id/cash-received` | `DRIVER` asignado o `ADMIN` |

No existen endpoints para rechazar una solicitud, registrar abordaje o llegada, consultar/verificar QR como chofer, ni confirmar una reserva como chofer. El resumen de chofer permite calcular el número de asientos ocupados, pero no asigna números de asiento. Aunque el servidor exige que haya un turno activo, la respuesta no incluye sus fechas/horas. La app no muestra botones que aparenten esas acciones. La verificación QR es exclusiva de administración (`POST /api/v1/admin/payments/:paymentId/qr-parts/:partId/review`). Estado `ON_TRIP`/`AVAILABLE` solo cambia el estado del vehículo; no registra horas o eventos de viaje.

## Cuentas y datos de prueba

1. Usa una base PostgreSQL exclusiva para pruebas y habilita `RUTA35_TEST_MODE=true` **en ese backend de pruebas**. No apuntes las apps a la base pública de Render ni uses información personal real.
2. Registra al pasajero desde la app con correo terminado en `.test` y contraseña de 14 caracteres o más. Registro público solo crea rol `PASSENGER`.
3. Un administrador de pruebas existente crea cuenta `DRIVER` con `POST /api/v1/admin/users` (correo `.test`, contraseña segura), vehículo con placa `TEST-...`, encola el vehículo y abre el turno con `POST /api/v1/admin/vehicles`, `/api/v1/admin/vehicles/:id/queue` y `/api/v1/admin/shifts`. No se crea admin desde móvil.
4. Crea reserva con ubicaciones que comienzan `PRUEBA:` y usa el flujo administrativo existente para confirmarla. La asignación del chofer usa su vehículo/cola compatible.
5. Las opciones Cash, QR y combinada son simulaciones. Efectivo registra una acción verificable; QR queda pendiente hasta decisión administrativa. No se muestra QR bancario ni se inicia una transferencia.

Las cuentas `.test` no sustituyen un servidor/base separados. Si el backend no está en modo de pruebas, los clientes bloquean inicio de sesión y mutaciones.

## Desarrollo en Android físico

Requisitos: Node.js 22+, pnpm o npm, Android Studio/ADB si se compila localmente, y teléfono Android con depuración USB para `expo run:android`.

```powershell
$env:EXPO_PUBLIC_API_BASE_URL = "https://URL-HTTPS-DEL-BACKEND-DE-PRUEBAS"
cd apps/passenger
npm install
npx expo start
```

Abre Expo Go en el teléfono y escanea el QR (en la misma red; usa `--tunnel` si la red lo requiere). Repite desde `apps/driver` para el otro cliente. Expo Go permite revisar UI/API; una APK de preview contiene SecureStore nativo y se recomienda para la prueba final. Para acceso con USB se puede usar `npx expo run:android` con Android Studio configurado.

No hemos probado en un teléfono físico en este entorno; el código no se declara validado en Android hasta hacer esa prueba. Usa cuentas y puntos `PRUEBA:` ficticios. En el cliente de chofer, realiza cualquier acción solo con el vehículo detenido.

## APK con EAS (opcional, sin cargo automático)

Los perfiles `preview` de ambos `eas.json` generan APK de distribución interna. Expo anuncia en Free hasta 15 builds Android por mes, baja prioridad; agota la cuota y EAS no empieza más builds hasta el siguiente mes. No requiere publicar en Play Store. Requiere tu cuenta Expo y autenticación local del CLI. Para evitar cualquier costo, mantén la cuenta Free y no añadas método de pago.

```powershell
$env:EXPO_PUBLIC_API_BASE_URL = "https://URL-HTTPS-DEL-BACKEND-DE-PRUEBAS"
cd apps/passenger
npx eas-cli build --platform android --profile preview
# Repetir en apps/driver
```

Solo publica enlaces de instalación cuando cada build de EAS concluya y el artefacto exista. No se iniciaron builds en esta etapa porque este entorno no dispone de una sesión EAS autenticada.

## Pruebas

Las pruebas unitarias del transporte compartido cubren HTTPS, Bearer, clave idempotente y desconexión. La suite backend cubre autenticación nativa, revocación y denegación de rutas entre roles. GitHub Actions usa PostgreSQL 16 temporal para integrar esas pruebas, y Expo export/typecheck verifica el bundle en CI. Los APK requieren build EAS y validación en un dispositivo por separado.
