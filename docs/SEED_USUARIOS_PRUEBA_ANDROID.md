# Carga de cuentas de prueba Android

El script `npm run seed:test-users` crea o reutiliza exactamente 100 pasajeros, 20 choferes, 20 vehículos de siete plazas, 20 turnos activos y 20 entradas de fila. La ciudad del chofer se representa mediante la dirección de su fila; el esquema no guarda una ciudad permanente en `User`.

## Protecciones

- Requiere `RUTA35_TEST_MODE=true` y confirmación literal `RUTA35_TEST_SEED_TARGET=ruta35-android-pruebas`.
- Solo acepta PostgreSQL Neon con base `neondb`, TLS requerido y hostname fijado en `RUTA35_TEST_SEED_ALLOWED_HOST`.
- Valida todos los nombres reservados `@example.test`, roles, capacidades, turnos y direcciones antes de confirmar una única transacción.
- Nunca borra registros ni altera cuentas con otro correo. Un usuario de prueba existente debe corresponder al rol esperado y a un archivo local de credenciales creado por esta herramienta.
- Las contraseñas son aleatorias, únicas, de 32 bytes antes de codificarse, y se guardan en PostgreSQL con Argon2id. No aparecen en consola.
- El CSV con contraseñas y el informe sin contraseñas requieren rutas absolutas fuera del repositorio. Mantén el archivo privado en tu perfil de Windows y no lo subas a GitHub ni lo compartas por chat.
- Si una cuenta, vehículo, turno o fila existente es incompatible, la transacción se cancela completa.

## Ejecución local

La conexión privada se introduce en una solicitud de PowerShell que no muestra lo que escribes. No la pegues en el chat, en un comando literal ni en un archivo `.env` del repositorio. Obtén el hostname del endpoint de la rama `production` del proyecto Neon `ruta35-android-pruebas`; este hostname no es la cadena privada completa.

```powershell
$env:RUTA35_TEST_MODE = 'true'
$env:RUTA35_TEST_SEED_TARGET = 'ruta35-android-pruebas'
$env:RUTA35_TEST_SEED_ALLOWED_HOST = Read-Host 'Hostname exacto del endpoint Neon de pruebas'
$env:RUTA35_TEST_CREDENTIALS_FILE = Join-Path $HOME 'Documents\Codex\outputs\Ruta35\credenciales-android-pruebas.csv'
$env:RUTA35_TEST_REPORT_FILE = Join-Path $HOME 'Documents\Codex\outputs\Ruta35\informe-android-pruebas.csv'
$secure = Read-Host 'DATABASE_URL privada de la base Neon de pruebas' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  npm run db:generate
  if ($LASTEXITCODE -ne 0) { throw 'Falló la generación del cliente Prisma' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación' }
  npm run seed:test-users
  if ($LASTEXITCODE -ne 0) { throw 'Falló la carga/verificación' }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Item Env:RUTA35_TEST_MODE,Env:RUTA35_TEST_SEED_TARGET,Env:RUTA35_TEST_SEED_ALLOWED_HOST,Env:RUTA35_TEST_CREDENTIALS_FILE,Env:RUTA35_TEST_REPORT_FILE -ErrorAction SilentlyContinue
}
```

`npm run db:generate` y `npm run build` deben terminar correctamente antes de ejecutar el seed. El script imprime solo el resultado agregado. Revisa los archivos locales resultantes y verifica que el CSV privado permanezca fuera del repositorio. El proceso se puede repetir con los mismos dos archivos; conservará las contraseñas de esa carga y no duplicará filas.

## Limpieza

No hay un borrado incluido. Para limpiar después de la etapa móvil se requiere una operación explícita posterior, limitada por las 120 direcciones reservadas, las 20 placas `TEST-*` y las relaciones de turnos/filas que pertenecen a esos vehículos. No uses `TRUNCATE`, `migrate reset` ni limpiezas globales sobre Neon.

