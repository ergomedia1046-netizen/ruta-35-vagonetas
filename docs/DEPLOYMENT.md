# Despliegue

No hay hosting ni dominio configurados. Antes de producción:

1. Provisionar PostgreSQL administrado y servicio Node.js; definir responsables, ubicación y retención de datos.
2. Cargar DATABASE_URL, SESSION_SECRET de al menos 32 bytes, NODE_ENV=production, PORT y orígenes autorizados en el gestor de secretos. No crear ni subir secretos al repositorio.
3. Instalar desde package-lock.json con npm ci; ejecutar npm run db:generate, npm run db:migrate, npm run build y npm run start.
4. En base vacía, crear una única primera cuenta admin con RUTA35_BOOTSTRAP_EMAIL y RUTA35_BOOTSTRAP_PASSWORD (14+ caracteres) y npm run bootstrap:admin; luego retirar las variables bootstrap.
5. Terminar TLS en proxy confiable, restringir CORS/orígenes y configurar cookies seguras antes de exponer públicamente.
6. Configurar backups cifrados y retención aprobada. Probar restauración en base aislada antes de abrir operación.
7. Usar solo después de workflow CI verde, flujos verificados y aprobación de tarifas, cancelaciones y método QR.

No está integrado ningún proveedor QR, correo, hosting ni sistema de backups. Sin integración, QR exige revisión administrativa manual. Los recargos de Bs 2, Bs 5 y Bs 10 no son oficiales.
