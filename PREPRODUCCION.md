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

## Primer pedido y factura

| Bloque | Datos disponibles | Pendiente para el piloto |
| --- | --- | --- |
| Comprador | Nombre, correo, idioma y dirección suiza de entrega | Decidir si hace falta un contacto para entrega y permitir dirección de facturación distinta cuando proceda |
| Pedido | Referencia, modelos, cantidades, precio en CHF, pago y expedición | Validar catálogo, precios y cargos de entrega reales |
| Emisor | Perfil de prueba | Confirmar razón social, domicilio, identificadores y datos de contacto que aparecerán en los documentos |
| Factura y abono | El pedido y el cobro ya están separados en el modelo de datos | Acordar tratamiento fiscal, numeración, fecha de emisión, desglose de impuestos y vínculo entre factura y abono. Implementar y comprobar los documentos |
| Entorno comercial | Copia y restauración probadas, permisos de prueba | Contratar alojamiento persistente, configurar dominio y HTTPS, accesos individuales y copias programadas |

Antes de aceptar pedidos reales, concilia un pedido de prueba con el
pago, la factura, el envío y el abono. Cambia el entorno de pagos solo
después de validar ese recorrido y completar la configuración comercial.
