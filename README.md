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
se agota el stock. Los correos quedan en la bandeja local.

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
