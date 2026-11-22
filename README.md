# Movility

Primer prototipo local del piloto suizo. Requiere Node.js 22.13 o posterior.

```sh
npm ci
npm start
```

Abre http://127.0.0.1:3000. La tienda tiene un modelo ficticio en alemán y francés,
una unidad disponible, imagen ilustrativa y precios en CHF. Puedes recorrer
la ficha del producto, el carrito y el seguimiento. En el checkout usa
datos ficticios, por ejemplo demo@example.com y el código postal 1201.
Los cuatro métodos de pago son simulados.

Puedes añadir varios modelos al mismo carrito, cambiar cantidades y retirar
artículos. El carrito se conserva al cambiar de idioma. Al pagar se comprueban
precio y stock de todas las líneas. El pedido conserva las cantidades, los
nombres y los precios vigentes en la compra.

El comparador incluye dos perfiles ficticios adicionales. Para sustituir
el modelo 3D, exporta un GLB autocontenido y sin compresión Draco o KTX2,
reemplaza `assets/movility-one.glb` y reinicia el servidor. El modelo de
demostración se puede regenerar con `python tools/generate-chair.py`.

La ficha tiene una galería de dos imágenes ilustrativas. Añade
`movility-one.mp4` y, por cada idioma disponible, los subtítulos WebVTT y la
transcripción de texto. Los archivos se llaman `movility-one.de-CH.vtt` y
`movility-one.de-CH.txt` para alemán, o `movility-one.fr-CH.vtt` y
`movility-one.fr-CH.txt` para francés. Se leen de `assets/` o del
directorio indicado por `MOVILITY_MEDIA_DIR`. Reinicia el servidor después.

La tienda de prueba envía `noindex`. Con `MOVILITY_PUBLIC_ORIGIN` configurado
como dominio HTTPS se pueden revisar URLs canónicas, alternancias
`hreflang` absolutas y `/sitemap.xml`, manteniendo la protección
contra indexación. El sitemap incluye portada, ficha, comparador y visor
en ambos idiomas.

El panel está en http://127.0.0.1:3000/admin. El usuario es `admin` y la contraseña
temporal aparece al arrancar. Desde el panel puedes registrar un envío, consultar
la bandeja simulada de confirmación y seguimiento, y registrar el reembolso.
También puedes cambiar el precio en CHF, las unidades disponibles y la
descripción de la ficha en ambos idiomas. Los pedidos conservan su precio original.
Un reembolso posterior a la expedición conserva el stock hasta que exista un
flujo de devolución física. El panel permite reponer una unidad cuando
se agota el stock. Los correos postcompra se generan en el idioma del pedido.
Abre cualquiera desde la bandeja local para ver destinatario, asunto, texto
y enlace de seguimiento. La **Cola de correos** muestra el estado y los
intentos. Los avisos nuevos se procesan cada tres segundos por un proveedor
simulado. Con `MOVILITY_EMAIL_WORKER=manual` se procesan solo desde el
botón del panel. Los avisos históricos conservan su vista previa.

### Prueba de envío con Resend

Para probar recepción externa con pedidos ficticios, verifica un dominio
remitente en Resend y configura estas variables en el entorno del servidor.

| Variable | Valor |
| --- | --- |
| `MOVILITY_EMAIL_MODE` | `resend-test` |
| `MOVILITY_RESEND_API_KEY` | Clave de envío de Resend |
| `MOVILITY_EMAIL_FROM` | Dirección del dominio verificado |
| `MOVILITY_EMAIL_TEST_TO` | Una única dirección de prueba bajo tu control |
| `MOVILITY_PUBLIC_ORIGIN` | Origen HTTPS de una tienda de prueba accesible |

Los avisos creados con este modo llevan el prefijo `[TEST]` y solo van
a la dirección de prueba. Los avisos anteriores en simulación siguen
siendo locales. Al desactivar el modo se pausa el envío de avisos de Resend
pendientes. Tras 23 horas desde el primer intento, los reintentos de un
envío externo quedan bloqueados para revisión. «Aceptado por Resend» indica
aceptación de la API. La comprobación de recepción se realiza en el buzón.

Consulta [las tareas del proyecto](TAREAS.md) para ver qué está listo y qué
queda para el piloto suizo y la expansión a la UE.

En **Gestionar modelos del catálogo** puedes crear y publicar hasta nueve
modelos adicionales con stock propio. Desmarca **Publicado en la tienda**
para archivar un modelo. Coloca sus archivos en `assets/models/` o
directamente en `MOVILITY_MEDIA_DIR` si se configuró ese directorio.

| Medio | Nombre de archivo para el SKU `alpine` |
| --- | --- |
| Galería | `alpine.jpg`, `alpine.side.jpg`, `alpine.rear.jpg` |
| Visor 3D | `alpine.glb` autocontenido |
| Vídeo | `alpine.mp4` |
| Subtítulos y transcripción DE | `alpine.de-CH.vtt`, `alpine.de-CH.txt` |
| Subtítulos y transcripción FR | `alpine.fr-CH.vtt`, `alpine.fr-CH.txt` |

El vídeo aparece en cada idioma con subtítulos WebVTT y transcripción.
Los medios de los modelos archivados dejan de servirse.

En **Movimientos de stock** puedes consultar el saldo por SKU y descargar CSV.
El saldo inicial se toma de la base de datos al activar el historial. Para
pedidos enviados, abre **Devolución física** en el pedido y registra las
unidades recibidas por referencia. Solo las marcadas como aptas se vuelven
a poner a la venta. La recepción y el reembolso son acciones independientes.
Al registrar un envío se pide un número de serie por silla. Los números
se guardan en mayúsculas y se eligen al recibir una devolución. Una serie
enviada o en revisión no se puede asignar a otro envío. Los pedidos enviados
antes de activar esta función conservan la recepción por cantidad.
Usa **Buscar número de serie** para ver los envíos y devoluciones de una unidad.

En **Conciliación de pedidos** puedes filtrar y exportar cobros y reembolsos
simulados por fecha UTC y medio de pago. El CSV lleva el identificador del
pedido, la moneda y el importe firmado; no incluye datos de contacto.
Las operaciones históricas sin fecha se incluyen cuando no hay filtro de fechas.

El usuario `admin` conserva acceso completo. Los perfiles de prueba se
habilitan al arrancar con una contraseña propia en la variable indicada.

| Usuario | Variable | Acceso |
| --- | --- | --- |
| `warehouse` | `MOVILITY_WAREHOUSE_PASSWORD` | Inventario, direcciones de entrega, expediciones y devoluciones físicas |
| `support` | `MOVILITY_SUPPORT_PASSWORD` | Consulta de pedidos, series y correo postcompra |
| `finance` | `MOVILITY_FINANCE_PASSWORD` | Conciliación, CSV y reembolsos, sin datos de contacto |

Son perfiles de la demo con autenticación HTTP. El control de cuentas
individuales, MFA y gestión de sesiones corresponde al piloto comercial.

El **Embudo de compra** está disponible para administración y finanzas.
Mide recorridos consentidos en orden desde la ficha hasta la compra, por
idioma de inicio y periodo. Las preferencias se pueden cambiar desde el
pie de la tienda. Retirar el consentimiento borra el recorrido asociado.

Los datos se guardan en `data/demo.sqlite`. Para una sesión nueva, arranca con
`MOVILITY_DB=:memory:`. El servidor solo escucha en el equipo local.

## GitHub Codespaces

Abre **Terminal → New Terminal** en el editor de Codespaces. En la carpeta
que contiene `package.json`, ejecuta `node -v`, `npm ci` y `npm start`. Si Node es
anterior a 22.13, ejecuta antes `nvm install 22` y `nvm use 22`.

Deja la terminal abierta y selecciona **Open in Browser** junto al puerto
**3000** en la pestaña **Ports**. Si el puerto no aparece, usa **Forward a Port**
e introduce **3000**. Mantén el puerto privado y usa la dirección
`https://…app.github.dev` que aparece en **Ports**. Para abrir el panel, añade
`/admin` al final de esa dirección.

Esta primera entrega prueba el recorrido de pedido. Para el piloto comercial
quedan las integraciones reales, los datos de entrega, la facturación, el
catálogo y multimedia reales, las notificaciones push y la configuración SEO
de producción. El prototipo solicita a los buscadores que no lo indexen.
