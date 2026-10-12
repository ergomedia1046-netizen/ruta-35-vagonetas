# Despliegue temporal gratuito en Render

Este repositorio incluye un Blueprint `render.yaml` para crear una instancia de prueba en Render. Usa un Web Service Free y una base PostgreSQL Free en la misma región; la API y la interfaz se sirven desde el mismo dominio HTTPS.

## Límites del plan gratuito

Render Free sirve para probar, no para operar transporte real. El servicio web se suspende después de 15 minutos sin tráfico y el primer acceso puede tardar cerca de un minuto. PostgreSQL Free tiene 1 GB, vence 30 días después de crearse y no incluye copias de seguridad. Exporta los datos ficticios antes de la fecha de vencimiento si necesitas conservarlos. No ingreses datos personales ni de viajes reales y no agregues tarjeta ni método de pago. Render documenta además cuotas de horas y ancho de banda; revisa el consumo y detén el servicio si la consola pide habilitar facturación. Consulta los límites vigentes en [Deploy for Free](https://render.com/docs/free).

## Crear el servicio

1. Inicia sesión en Render y elige **New → Blueprint**. Conecta este repositorio y la rama `main`; Render leerá `render.yaml`.
2. Selecciona exclusivamente el plan **Free** para el servicio web y PostgreSQL. Si la consola no ofrece ambos planes gratuitos o solicita un método de pago, cancela sin confirmar.
3. Cuando pida las variables `RUTA35_BOOTSTRAP_EMAIL` y `RUTA35_BOOTSTRAP_PASSWORD`, usa el correo ficticio `admin@example.test` y una contraseña temporal única de al menos 14 caracteres. Escribe la contraseña solo en Render, nunca en GitHub, el navegador compartido ni capturas.
4. Espera a que el servicio termine de compilar y desplegar. El comando de inicio aplica migraciones y crea ese primer administrador solo si la tabla de usuarios está vacía.
5. Comprueba `https://<servicio>.onrender.com/health`; debe responder JSON con `"status":"ok"`. Abre después la URL raíz desde el celular y la computadora; verás el aviso amarillo **ENTORNO DE PRUEBAS**.
6. En Render, elimina `RUTA35_BOOTSTRAP_EMAIL` y `RUTA35_BOOTSTRAP_PASSWORD` de las variables del servicio y guarda el cambio. No borres `SESSION_SECRET` ni `DATABASE_URL`. Render volverá a iniciar el servicio; el bootstrap omitirá la creación porque ya hay cuentas. Conserva el correo y contraseña del admin en un gestor de contraseñas.

El Blueprint genera `SESSION_SECRET` en Render. En producción `NODE_ENV=production` activa cookies `Secure`, `HttpOnly` y `SameSite=Strict`; no se necesita CORS porque el HTML y la API comparten origen. Render termina HTTPS y el servicio escucha en `0.0.0.0` usando `process.env.PORT`. PostgreSQL usa la URL privada interna del mismo servicio/región, sin exponer la base a Internet; si se usa una conexión externa o Neon, debe llevar TLS (`sslmode=require`).

## Cuentas ficticias y flujo de prueba

1. En el inicio de sesión, usa **Crear cuenta ficticia de pasajero** con direcciones reservadas, por ejemplo `pasajero1@example.test`. La API permite ese registro solo con `RUTA35_TEST_MODE=true`, obliga a usar el dominio `.test`, limita intentos y asigna siempre el rol pasajero.
2. Inicia sesión como `admin@example.test`. En **Administración → Crear cuenta**, crea `conductor1@example.test` con rol Conductor y, opcionalmente, `admin2@example.test` con rol Administrador. Usa contraseñas temporales diferentes, fuertes y de 14 o más caracteres. No uses nombres, teléfonos, correos ni contraseñas reales.
3. Registra una vagoneta con una placa ficticia como `TEST-001`, registra su llegada a la fila y crea un turno con el ID de la cuenta de conductor y el ID del vehículo. La interfaz muestra ambos IDs al crearlos.
4. Cierra sesión. Crea una reserva desde el pasajero (dirección en cualquiera de los dos sentidos, de 1 a 7 pasajeros o expreso de 7). Escribe `PRUEBA:` al inicio del punto de recogida y referencia, usando solo ubicaciones inventadas; el backend rechaza esos campos si no tienen el prefijo. El administrador confirma la reserva; el conductor ve solicitudes compatibles y asigna el vehículo. Para probar cinco más dos, crea dos solicitudes compatibles antes de asignar.
5. Los pagos son simulaciones: Efectivo solo registra una recepción ficticia; QR es una revisión manual de prueba sin transferencia bancaria; Combinado registra ambas partes sin cobrar. Puedes marcar QR verificado únicamente para comprobar estados. El panel y el encabezado identifican el entorno como prueba. No se conecta a bancos ni se aceptan capturas como comprobante.

La aplicación guarda estos registros de prueba en PostgreSQL; no introduzcas información personal. La reserva de expreso ocupa siete asientos por Bs 245; la tarifa ordinaria continúa en Bs 35 por pasajero. No se modifican tarifas ni reglas comerciales.

## Migraciones y arranque

Render instala desde `package-lock.json`, genera Prisma y compila TypeScript durante el build. Al iniciar, ejecuta `prisma migrate deploy`, ejecuta el bootstrap seguro (omite si las credenciales no existen o si ya hay usuarios) y arranca Fastify. Las migraciones son idempotentes. El endpoint `/health` permite a Render comprobar el servicio.

## Alternativa si PostgreSQL Free no aparece

Neon Free publica actualmente un plan gratuito con 0.5 GB por proyecto y suspende cómputo después de cinco minutos inactivo. Si Render no permite crear PostgreSQL Free, crea manualmente un proyecto Neon Free, copia su URL de conexión con SSL (`sslmode=require`) en la variable privada `DATABASE_URL` del servicio Render, y elimina del Blueprint el bloque `databases` y la referencia `fromDatabase` antes de sincronizarlo. Nunca guardes la cadena de conexión en el repositorio. Revisa los límites actuales antes de elegir la alternativa.

Blueprint según la [especificación Render](https://render.com/docs/blueprint-spec). Si se usa Neon, revisa [sus planes](https://neon.tech/docs/introduction/plans) y [Scale to Zero](https://neon.tech/docs/introduction/scale-to-zero).

## Fuera del alcance

No hay dominio comprado, pagos bancarios, QR de cobro, SMS, correo transaccional ni integración con vehículos reales. El despliegue gratuito no tiene garantías de disponibilidad, copias de seguridad ni conservación de datos. No usar esta instalación con pasajeros ni para coordinar viajes reales.
