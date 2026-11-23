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

El panel está en http://localhost:3000/admin. El usuario es `admin`. Con
`npm start` y la base local predeterminada, la contraseña se genera una vez y
se guarda en `data/admin-password.txt`, excluido de Git. Si defines
`MOVILITY_ADMIN_PASSWORD`, esa contraseña tiene prioridad. En el entorno
local puedes cambiar la clave en `/admin/security`. El archivo pasa a
contener un hash scrypt y la clave anterior deja de ser válida. Desde el panel
puedes registrar un envío, consultar
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

Ejecuta `npm run email:verify-config` para comprobar que la configuración
está completa sin mostrar credenciales ni enviar mensajes. Después, en la
instancia HTTPS de prueba, abre un enlace de pedido ficticio en una ventana
privada y solicita el código con la dirección registrada del pedido. La
entrega externa se dirige únicamente al buzón de prueba configurado. Abre
el enlace del correo y verifica el pedido con el código y la dirección
registrada del pedido. Comprueba que el mismo código falla al reutilizarlo.

Los avisos creados con este modo llevan el prefijo `[TEST]` y solo van
a la dirección de prueba. Los avisos anteriores en simulación siguen
siendo locales. Al desactivar el modo se pausa el envío de avisos de Resend
pendientes. Tras 23 horas desde el primer intento, los reintentos de un
envío externo quedan bloqueados para revisión. «Aceptado por Resend» indica
aceptación de la API. La comprobación de recepción se realiza en el buzón.

Consulta [las tareas del proyecto](TAREAS.md) para ver qué está listo y qué
queda para el piloto suizo y la expansión a la UE.

En **Gestionar modelos del catálogo** puedes crear familias y publicar
artículos con stock propio sin un tope de catálogo. La ficha **Características,
fotos y vídeo** permite editar características en ambos idiomas y subir o
reemplazar archivos. Los archivos subidos se guardan al lado de la base,
en la carpeta con sufijo `.media`; inclúyela en las copias de medios.
Desmarca **Publicado en la tienda**
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

### Seguimiento de envíos

Tras registrar un envío, el panel de almacén permite simular tránsito,
entrega o incidencia. El cliente ve el historial en el idioma de la tienda.
La primera entrega registrada genera un aviso. Los eventos repetidos o
fuera de orden conservan el historial sin revertir una entrega confirmada.

Para conectar un transportista, un adaptador puede enviar JSON a
`POST /integrations/carrier/events` con `eventId`, `orderId`, `tracking`,
`status` (`transit`, `delivered` o `exception`) y `occurredAt` en ISO UTC.
El adaptador firma los bytes exactos con HMAC-SHA256, usando
`MOVILITY_CARRIER_SECRET` y anteponiendo los segundos Unix y un punto.
Envía los segundos en `X-Movility-Timestamp` y el hash en
`X-Movility-Signature`, con formato `sha256=<hex>`. La solicitud caduca
a los cinco minutos. Sin secreto configurado, la entrada permanece desactivada.

### Notificaciones push por pedido

En el seguimiento del pedido, cada navegador puede activar o desactivar
avisos de expedición y entrega. La baja afecta solo a ese pedido. El mensaje
visible omite el producto y los datos de contacto, y al pulsarlo se abre
el seguimiento. Las suscripciones caducan a los 30 días.

Genera un par VAPID con `npx web-push generate-vapid-keys` y configura
`MOVILITY_PUSH_PUBLIC_KEY`, `MOVILITY_PUSH_PRIVATE_KEY` y
`MOVILITY_PUSH_SUBJECT` (por ejemplo, un contacto en formato `mailto:`).
`MOVILITY_PUSH_MODE=simulated` muestra los controles y simula la entrega.
`MOVILITY_PUSH_MODE=web-push` usa el servicio del navegador desde un origen
seguro. Las suscripciones de simulación no pasan al modo real. El valor
predeterminado `off` desactiva el módulo. Los correos siguen su propia cola.

### Stripe Checkout en modo de prueba

La demo usa pagos simulados por defecto. Para habilitar Stripe Checkout con
pedidos ficticios, configura estas variables en el entorno del servidor.

| Variable | Valor |
| --- | --- |
| `MOVILITY_PAYMENT_MODE` | `stripe-test` |
| `MOVILITY_STRIPE_SECRET_KEY` | Clave de prueba `sk_test_…` |
| `MOVILITY_STRIPE_WEBHOOK_SECRET` | Secreto del endpoint `whsec_…` |
| `MOVILITY_PUBLIC_ORIGIN` | Origen HTTPS del sitio de prueba |
| `MOVILITY_STRIPE_METHODS` | `card` por defecto. Añade `twint,paypal` cuando estén habilitados en la cuenta |

Configura `/integrations/stripe/events` para los eventos
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed` y `checkout.session.expired`.
El pedido solo se crea tras recibir una confirmación firmada del cobro en CHF.
El stock se reserva al iniciar el pago y se libera al recibir un fallo o
caducidad confirmados. Si Stripe no confirma el resultado, la reserva queda
visible en **Pagos de prueba con Stripe** para revisión. El regreso desde
Checkout consulta el estado. Las claves de producción se rechazan y la
simulación de reembolsos queda deshabilitada para pedidos de Stripe.
Finanzas puede solicitar un reembolso total de prueba desde el pedido.
Añade al mismo endpoint los eventos `refund.created`, `refund.updated`
y `refund.failed`. El panel registra el reembolso tras la confirmación
firmada y solo repone stock si el pedido todavía no salió. Los reembolsos
parciales o iniciados fuera de Movility requieren conciliación manual.

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

### Copias de seguridad y recuperación

- `npm run db:backup` crea y verifica una copia SQLite en `data/backups/`.
  Puedes indicar otra carpeta con `npm run db:backup -- "ruta"`. Usa
  `MOVILITY_DB` si la tienda trabaja con una base distinta.
- `npm run db:verify -- "ruta/backup.sqlite"` verifica la integridad y las referencias.
- `npm run db:restore -- "ruta/backup.sqlite" "data/recuperada.sqlite"` crea
  una base independiente. Para probarla, arranca otra instancia con
  `MOVILITY_DB` apuntando a ese archivo, un puerto distinto y las
  integraciones externas en simulación.

Estas copias incluyen los datos del pedido y del panel. Guárdalas en
almacenamiento privado, fuera de Git. Los medios y la configuración del
servidor se recuperan por separado.

## Preproducción

`npm run staging` arranca una tienda local con su propia base y servicios
simulados. Consulta la [guía de preproducción](PREPRODUCCION.md).

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
## Páginas informativas

Contacto y Quiénes somos están disponibles en alemán y francés. Configura
`MOVILITY_CONTACT_EMAIL` con el buzón público de atención al cliente para
mostrar el enlace de correo en la ficha de contacto.
