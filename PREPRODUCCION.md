# Preproducción de Movility

La instancia local de preproducción usa `data/staging/staging.sqlite` y
solo datos ficticios. Arranca con `npm run staging` y abre
`http://127.0.0.1:3040`. La consola muestra la contraseña del usuario
`admin`; para fijar una propia usa `MOVILITY_STAGING_ADMIN_PASSWORD`.
Puedes cambiar el puerto con `MOVILITY_STAGING_PORT`.

Las integraciones de pago, correo, transportista y push no envían datos
externos desde esta instancia. La base persiste al reiniciar y queda fuera
del repositorio. Para copiarla, ejecuta los comandos de base de datos del
README con `MOVILITY_DB` apuntando al archivo de preproducción.

Con la instancia arrancada, `npm run staging:verify` comprueba la
disponibilidad de la base, los idiomas, el bloqueo de indexación y que
Stripe y el transportista siguen desactivados. Puedes pasar otro origen
local con `npm run staging:verify -- http://127.0.0.1:3041`.
El endpoint `GET /healthz` devuelve 200 si puede consultar la base,
o 503 si la consulta falla. No incluye registros de clientes.

## Primer pedido y factura

| Bloque | Datos disponibles | Pendiente para el piloto |
| --- | --- | --- |
| Comprador | Nombre, correo, idioma, dirección de entrega y dirección de facturación suiza opcional | Decidir si hace falta un contacto para entrega |
| Pedido | Referencia, modelos, cantidades, precio en CHF, pago y expedición | Validar catálogo, precios y cargos de entrega reales |
| Emisor | Perfil de prueba | Confirmar razón social, domicilio, identificadores y datos de contacto que aparecerán en los documentos |
| Factura y abono | Documentos de prueba en DE/FR, numerados y vinculados, imprimibles desde Finanzas | Confirmar tratamiento fiscal, numeración comercial y desglose de impuestos antes de emitir documentos válidos |
| Entorno comercial | Copia y restauración probadas, permisos de prueba | Contratar alojamiento persistente, configurar dominio y HTTPS, accesos individuales y copias programadas |

Antes de aceptar pedidos reales, concilia un pedido de prueba con el
pago, la factura, el envío y el abono. Cambia el entorno de pagos solo
después de validar ese recorrido y completar la configuración comercial.

Los documentos se generan para pedidos nuevos. La factura copia los datos
vigentes al cobro y el abono reutiliza esa copia. Puedes abrirlos desde el
pedido en Administración o Finanzas e imprimirlos o guardarlos como PDF
desde el navegador. Llevan un emisor ficticio y un aviso de prueba.
