# Preproducción privada de Mobility

## Preparación local

1. Instala las dependencias con `npm ci`. Copia `.env.staging.example` a
   `.env.staging`. El ejemplo contiene solo nombres y valores inocuos. Mantén
   el archivo local y guarda los secretos del alojamiento en su gestor de
   variables.
2. Para una prueba sin servicios externos, deja pagos y correo en
   `simulated` y el origen vacío. Ejecuta `npm run staging` con variables
   de entorno exportadas, o `node --env-file=.env.staging ops/staging.mjs`
   para cargar el archivo. La URL local por defecto es
   `http://127.0.0.1:3040`. Configura `MOVILITY_STAGING_PORT` para
   usar otro puerto libre.
3. La base y los medios se guardan bajo `data/staging/`. Mantén esa ruta
   en almacenamiento persistente. El perfil usa `staging.sqlite` e
   inicializa Mobility One, una silla de una unidad y un accesorio ficticio.
   Reiniciar conserva los pedidos, el inventario y las fichas editadas. La
   base normal `data/demo.sqlite` y el valor heredado de `MOVILITY_DB`
   quedan fuera del perfil. Para repetir desde cero sin perder datos,
   fija `MOVILITY_STAGING_DB` a un archivo nuevo en un directorio independiente.
   Los medios subidos quedan en `<base>.media/`, al lado de esa base. El
   lanzador rechaza usar `data/demo.sqlite` para el piloto. Los dos
   artículos QA solo se siembran al crear la base. En el VPS, conserva
   `MOVILITY_STAGING_DB=/var/lib/mobility/staging.sqlite` y
   `MOVILITY_STAGING_ORIGIN=https://mobility.wurfis.ch`. El servicio necesita
   escritura en el volumen y puede usar un checkout de Git de solo lectura.
4. Con la instancia arrancada, ejecuta `npm run staging:verify`. Para otro
   puerto, usa `npm run staging:verify -- http://127.0.0.1:3041`. Comprueba
   el catálogo bilingüe, `noindex`, el acceso al admin y los endpoints de
   integración. Si la instancia usa Stripe de prueba, añade
   `--stripe-test` para verificar que los avisos sin firma reciben 401.
   `GET /healthz` devuelve 200 si puede consultar la base, o 503 si falla.
   `staging:verify` se ejecuta contra el puerto HTTP interno de loopback.
   Para comprobar también HTTPS y el acceso privado usa el ensayo siguiente.

### Ensayo reproducible por HTTPS

Desde la raíz del repo, con Node.js y OpenSSL instalados:

```powershell
# Si OpenSSL no está en PATH, puedes usar el de Git for Windows:
$env:MOVILITY_REHEARSAL_OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe'
node ops/rehearse-staging.mjs
```

El ensayo elige puertos libres de loopback, crea un certificado temporal con
SAN para `127.0.0.1` y confía en él para sus propias peticiones. No instala
el certificado en el sistema ni cambia el puerto 3000. El proxy de ensayo
exige una cookie efímera para todas las rutas. `/admin` exige además sus
propias credenciales. Este proxy es una prueba local del aislamiento.
En el VPS configura el mecanismo de acceso privado que usará el cliente.

El ensayo usa una base demo nueva y modos simulados. Fija CHF 12.50 de envío
ficticio y carga una foto en `qa-chair`. Completa una compra directa de
Mobility One en alemán (CHF 2’511.50) y un carrito con `qa-chair` y `qa-bag`
en francés (CHF 1’941.50). Expide el pedido francés con seguimiento y una
serie ficticios, registra «En tránsito», procesa la cola manual y comprueba
el correo y sus enlaces HTTPS. Finalmente restaura la base y los medios,
arranca la copia y comprueba pedido, stock, serie, seguimiento, correo y foto.
Al terminar limpia los archivos temporales de ese ensayo.

## Acceso privado y correo

Para el piloto alojado usa `MOVILITY_STAGING_ORIGIN=https://mobility.wurfis.ch`,
sin ruta ni barra final, y fija
`MOVILITY_STAGING_ADMIN_PASSWORD`. La aplicación escucha en loopback.
Sitúa un proxy HTTPS delante y protege todas las páginas, medios y
formularios con una lista de IP permitidas o un acceso corporativo basado
en sesión. Conserva el encabezado `Host` público y la autenticación
propia de `/admin`. Comprueba desde una sesión sin acceso que la tienda
queda bloqueada y, con acceso, que las páginas conservan
`X-Robots-Tag: noindex, nofollow`. La cabecera de indexación no sustituye
el control de acceso.

Antes de desplegar, confirma el hostname HTTPS, quién administra el
proxy y el acceso privado de los probadores, y la ruta persistente de
`data/staging/`. Prepara la contraseña de administración en el gestor de
secretos. Arranca con pagos y correo en `simulated` y activa cada
integración de prueba solo durante su comprobación.

Para conservar el correo en la cola local, deja
`MOVILITY_STAGING_EMAIL_MODE=simulated`. Para recibir mensajes de prueba,
usa `resend-test` con `MOVILITY_STAGING_RESEND_API_KEY`, un remitente
verificado en `MOVILITY_STAGING_EMAIL_FROM` y una sola dirección propia
en `MOVILITY_STAGING_EMAIL_TEST_TO`. El proveedor dirige todos los avisos
externos al buzón de pruebas. El procesamiento es manual desde
**Cola de correos** en el panel. Prueba los enlaces de pedido y seguimiento
con un pedido ficticio en cada idioma y con acceso al sitio privado.

## Web Push

Para ensayar la cola local, usa `MOVILITY_STAGING_PUSH_MODE=simulated`.
Puedes dejar vacías las tres variables VAPID. El servidor genera una
clave pública de prueba para esa ejecución. El trabajador registra el
resultado como **Aceptado en simulación** en `/admin/push`.

Para comprobar un aviso visible en un navegador, usa
`MOVILITY_STAGING_PUSH_MODE=web-push` y el origen HTTPS de pruebas.
Genera un par VAPID con `npx web-push generate-vapid-keys`. Configura
`MOVILITY_STAGING_PUSH_PUBLIC_KEY`, `MOVILITY_STAGING_PUSH_PRIVATE_KEY`
y `MOVILITY_STAGING_PUSH_SUBJECT` con un contacto operativo, por ejemplo
`mailto:soporte@example.com`. Conserva el par por origen entre reinicios,
guarda la clave privada en el gestor de secretos y habilita salida HTTPS
del servidor a los servicios push admitidos. Usa un perfil de navegador
de prueba y crea la suscripción en el modo que vas a verificar.

## Copia y restauración del volumen

Detén el servicio de preproducción antes de copiar el volumen para que
los medios y SQLite queden sincronizados. Conserva juntos
`backup.sqlite` y, si existe, `backup.sqlite.media/`. El comando comprueba
la integridad SQLite y copia los medios subidos de ese volumen. Guarda
la copia en almacenamiento privado, fuera del repositorio.

Desde la raíz del proyecto, en PowerShell. Usa la ruta efectiva del piloto
en la primera línea. Si la configuraste dentro de `.env.staging`, copia
aquí el valor de `MOVILITY_STAGING_DB` antes de ejecutar la copia:

```powershell
$env:MOVILITY_DB = (Resolve-Path 'data/staging/staging.sqlite').Path
$ensayoMovility = Join-Path $env:TEMP ('movility-restore-' + [guid]::NewGuid())
$salidaCopiaMovility = node ops/database.mjs backup-volume (Join-Path $ensayoMovility 'backups')
if ($LASTEXITCODE -ne 0 -or $salidaCopiaMovility -notmatch '^Copia verificada: (.+)$') {
  throw 'No hay una ruta de copia verificada.'
}
$copiaMovility = $Matches[1]
$restauradaMovility = Join-Path $ensayoMovility 'restore/staging.sqlite'
node ops/database.mjs restore-volume $copiaMovility $restauradaMovility
if ($LASTEXITCODE -ne 0) { throw 'Fallo al restaurar el volumen.' }
Remove-Item Env:MOVILITY_DB
```

Con el servicio original detenido, fija `MOVILITY_STAGING_DB` a
`$restauradaMovility` y arranca la copia con `npm run staging`, pagos y correo
en `simulated` y Web Push en `off`. Si usas un proxy, conserva el origen
HTTPS y apunta el proxy al puerto interno de la copia. El original se
conserva en su ruta. Revisa en el panel
la referencia del pedido, la serie, el seguimiento y el saldo del SKU.
Abre una foto subida desde la ficha pública. El ensayo local automatizado
arranca la copia desde una ruta temporal y compara también los bytes de la foto.

## Stripe en modo prueba

La credencial local anterior de Stripe CLI devolvió `api_key_expired`.
En el entorno de pruebas de Stripe, consigue una clave secreta vigente
`sk_test_…` y ponla en `MOVILITY_STAGING_STRIPE_SECRET_KEY`. El perfil
rechaza el modo activo y las claves `sk_live_…`. Usa
`MOVILITY_STAGING_PAYMENT_MODE=stripe-test` y empieza con
`MOVILITY_STAGING_STRIPE_METHODS=card`. [Claves de Stripe](https://docs.stripe.com/keys)

1. Para el futuro despliegue, registra un destino de eventos de **prueba**
   con formato **Snapshot** en Stripe Workbench en
   `https://mobility.wurfis.ch/integrations/stripe/events`. En el proxy,
   exceptúa del control de acceso de visitantes únicamente el método
   `POST` a esa ruta exacta. Reenvía el cuerpo sin transformarlo y
   conserva `Stripe-Signature`. La aplicación verifica la firma sobre
   el cuerpo original y rechaza los eventos de modo activo.
2. Suscribe `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` y `checkout.session.expired`.
   Para probar también reembolsos, añade `refund.created`,
   `refund.updated` y `refund.failed`.
3. Copia el secreto de firma `whsec_…` de ese destino a
   `MOVILITY_STAGING_STRIPE_WEBHOOK_SECRET`. Para probar solo en local,
   puedes renovar la sesión con `stripe login` y usar
   `stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to http://127.0.0.1:3040/integrations/stripe/events`.
   Usa el secreto que imprime ese listener; es distinto del del
   destino de Workbench. Mantén un origen HTTPS de retorno accesible
   para los probadores. [Guía de webhooks de Stripe](https://docs.stripe.com/webhooks)
4. Arranca preproducción y completa un checkout de la silla ficticia con
   una tarjeta oficial de prueba. En `/admin/orders?status=paid` debe
   aparecer un pedido. En inventario debe constar una salida.
   Reenvía el aviso desde Workbench si usas ese destino y comprueba
   que ambos recuentos se mantienen. [Tarjetas de prueba](https://docs.stripe.com/testing)
5. Repón una unidad de prueba y abre otra sesión sin pagar. Al volver a
   la tienda, comprueba que la reserva sigue abierta. Espera la caducidad
   natural (32 minutos configurados por Mobility) y anota la hora de
   entrega de `checkout.session.expired` y la primera consulta en la que
   vuelve a aparecer la unidad. Para comprobar solo la recepción del
   aviso sin esperar, puedes caducar antes esa misma sesión
   `cs_test_…` mediante la API de pruebas. Esa comprobación no mide
   el plazo natural. [Caducar una sesión de Checkout](https://docs.stripe.com/api/checkout/sessions/expire)

## Comprobaciones tras desplegar

1. **Acceso.** Confirma HTTPS, el bloqueo fuera del acceso privado,
   la autenticación de `/admin` y `noindex` en `/de-CH` y `/fr-CH`.
2. **Stripe de prueba en alemán.** Completa un pedido ficticio con tarjeta
   de prueba. Comprueba que hay un único pedido y un único descuento
   de stock, incluso al repetir el aviso. Abre otra sesión, abandónala y
   observa que se mantiene la reserva hasta recibir
   `checkout.session.expired`. Anota la hora del aviso y de la reposición.
3. **Correo en francés.** Haz un pedido ficticio, expídelo y procesa la
   cola manual. Comprueba la confirmación y el aviso de expedición en el
   único buzón autorizado. Confirma el importe en CHF, el idioma y
   que los enlaces abren el pedido y el seguimiento por HTTPS.
4. **Push en francés.** Desde el pedido, activa los avisos y cierra todas
   las pestañas de la tienda. Con el navegador operativo en segundo
   plano, registra la entrega desde otro navegador. Comprueba que el
   aviso se ve en el dispositivo y que al pulsarlo se abre el seguimiento.
   Registra por separado lo que muestra el dispositivo y el resultado
   de `/admin/push`.

### Mi cuenta en pruebas

Desde `/fr-CH/account` o `/de-CH/account`, solicita un código con un
correo ficticio. El administrador puede recogerlo en `/admin/customer-codes`.
Para vincular un pedido, genera también su código desde Administración,
verifícalo como invitado con el mismo correo y elige **Asociar el pedido**
en Mi cuenta. El correo permanece en simulación y esta función solo se
habilita en preproducción.

Las preferencias de ofertas están en `/fr-CH/offers` y `/de-CH/offers`.
Confirma el alta mediante el código de `/admin/offer-codes`; el buzón
también muestra el código para probar la baja sin cuenta. En
`/admin/campaigns` puedes redactar una
campaña DE/FR, seleccionar personas o a todos los suscritos al programarla
y elegir cuándo procesarla. La cola comprueba el consentimiento otra vez
antes de simular el envío y excluye las bajas.

## Primer pedido y factura

| Bloque | Datos disponibles | Pendiente para el piloto |
| --- | --- | --- |
| Comprador | Nombre, correo, idioma, dirección de entrega y dirección de facturación suiza opcional | Decidir si hace falta un contacto para entrega |
| Pedido | Referencia, modelos, cantidades, precio en CHF, pago y expedición | Validar catálogo, precios y cargos de entrega reales |
| Emisor | Configurable en **Emisor y fiscalidad** | Confirmar razón social, domicilio, país y correo del emisor |
| Factura y abono | Documentos DE/FR numerados, vinculados y con datos congelados al emitir | Confirmar tratamiento fiscal y numeración con el responsable contable |
| Entorno comercial | Copia y restauración probadas, permisos de prueba | Contratar alojamiento persistente, configurar dominio y HTTPS, accesos individuales y copias programadas |

En el piloto privado, concilia un pedido ficticio con el pago, la factura,
el envío y el abono. Mantén los cobros reales desactivados.

Los documentos se generan para pedidos nuevos. La factura copia los datos
vigentes al cobro y el abono reutiliza esa copia. Puedes abrirlos desde el
pedido en Administración o Finanzas e imprimirlos o guardarlos como PDF
desde el navegador. Los documentos simulados conservan el prefijo
`TEST-` y se identifican como pruebas. Las emisiones comerciales muestran
`INV-` para facturas y `CR-` para abonos, siguiendo la secuencia de la base.
Los documentos históricos conservan sus referencias y sus datos.

## Configuración comercial separada

El arranque normal y el piloto siguen en simulación por defecto. El piloto
admite únicamente `stripe-test` y `resend-test` como integraciones externas.
El correo de ese modo se dirige a un único buzón autorizado. No reutilices
la base del piloto, sus claves ni el secreto de firma de su webhook.

La activación comercial exige estos valores juntos, en el entorno del
servicio. Guarda las credenciales en el gestor de secretos.

| Variable | Valor o dato requerido |
| --- | --- |
| `MOVILITY_STAGE` y `MOVILITY_ENABLE_LIVE` | `production` y `1` |
| `MOVILITY_CATALOG_PROFILE` y `MOVILITY_DB` | `commercial` y una base persistente separada del piloto |
| `MOVILITY_PUBLIC_ORIGIN` | Origen HTTPS comercial sin ruta |
| `MOVILITY_ADMIN_PASSWORD` | Credencial del panel en el gestor de secretos |
| `MOVILITY_PAYMENT_MODE` | `stripe-live` |
| `MOVILITY_STRIPE_LIVE_SECRET_KEY` y `MOVILITY_STRIPE_LIVE_WEBHOOK_SECRET` | Clave secreta comercial y secreto del destino comercial de eventos |
| `MOVILITY_STRIPE_METHODS` | Lista de `card`, `twint` y `paypal` separados por comas. Habilita solo los métodos aprobados en Stripe. El valor predeterminado es `card`. |
| `MOVILITY_EMAIL_MODE` | `resend-live` |
| `MOVILITY_RESEND_LIVE_API_KEY` y `MOVILITY_EMAIL_LIVE_FROM` | Clave de envío y remitente de un dominio verificado |

Deja sin definir `MOVILITY_STRIPE_SECRET_KEY`, `MOVILITY_STRIPE_WEBHOOK_SECRET`,
`MOVILITY_RESEND_API_KEY`, `MOVILITY_EMAIL_FROM` y
`MOVILITY_EMAIL_TEST_TO` en el servicio comercial. El arranque rechaza
mezclas. El destino comercial de Stripe recibe los mismos tipos de eventos
enumerados en la sección de pruebas, en `/integrations/stripe/events`, con
su propia firma. Las reservas, sesiones y reembolsos conservan su modo.
Finaliza las reservas de prueba en el piloto. El modo comercial procesa
solo los correos asignados a pedidos comerciales, con el destinatario del
pedido guardado en la cola.

`node --test commercial.test.mjs stripe-payments.test.mjs resend-test.test.mjs`
verifica el flujo con datos ficticios y adaptadores simulados. Antes de
abrir ventas, verifica el alta comercial de Stripe y cada método elegido,
la recepción firmada del webhook, el cobro, la caducidad y el reembolso con
Stripe, y el dominio, la entrega y los enlaces con Resend. Completa el catálogo y las condiciones comerciales antes de activar el entorno.

### Emisor e IVA

Completa **Configuración → Emisor y fiscalidad** (`/admin/billing`) primero
en simulación, sobre la base destinada a ventas. El perfil requiere razón
social, calle y número, código postal, localidad, país ISO y correo. Si el
correo del emisor queda vacío, se reutiliza el correo público de Contacto.
La dirección del vendedor se registra separadamente de la dirección de
atención al cliente.

El tratamiento inicial queda pendiente. Confirma con el responsable fiscal
si todos los precios del piloto incluyen IVA a una misma tasa o si no se
repercute IVA. En el primer caso, confirma la tasa y el número de IVA. En
el segundo, aporta la mención aprobada en alemán y francés. Marca la
confirmación expresa al guardar. Si el catálogo requiere tasas distintas
por artículo, este perfil no cubre ese caso.

El perfil incompleto bloquea el arranque comercial. Los cambios posteriores
se aplican a documentos nuevos. Para pagos comerciales, el perfil se fija
al reservar el pedido para que un cambio entre reserva y confirmación no
modifique las condiciones aplicadas. El abono enlaza la factura y utiliza
sus datos, con importes en negativo.

### Envío dentro de Suiza

En **Configuración → Tarifa de envío en Suiza** (`/admin/shipping`),
elige **Pendiente**, **Gratuito** o **Tarifa fija por pedido**. La tarifa fija
es el importe total en CHF por pedido, con independencia de su composición.
El modo pendiente bloquea las compras comerciales. En simulación permite
continuar y muestra que la tarifa sigue pendiente.

Si el perfil fiscal usa IVA incluido, confirma expresamente que dicho
importe también incluye IVA a la misma tasa. Un cambio de tasa requiere
confirmarla de nuevo. No se presume una tasa distinta para el envío.
El importe, la modalidad y la confirmación fiscal aplicada se guardan
con el pedido. Un abono total incluye el envío facturado originalmente.

Las tarifas por familia, las excepciones por código postal o destino y
la combinación de tarifas en carritos mixtos quedan pendientes de
definición comercial antes de añadir esas reglas.
