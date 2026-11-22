# Movility

Primer prototipo local del piloto suizo. Requiere Node.js 22.13 o posterior.

```sh
npm start
```

Abre http://127.0.0.1:3000. La tienda tiene un modelo ficticio en alemán y francés,
una unidad disponible, imagen ilustrativa y precios en CHF. Puedes recorrer
la ficha del producto, el carrito y el seguimiento. En el checkout usa
datos ficticios, por ejemplo demo@example.com y el código postal 1201.
Los cuatro métodos de pago son simulados.

El panel está en http://127.0.0.1:3000/admin. El usuario es `admin` y la contraseña
temporal aparece al arrancar. Desde el panel puedes registrar un envío, consultar
la bandeja simulada de confirmación y seguimiento, y registrar el reembolso.
Un reembolso posterior a la expedición conserva el stock hasta que exista un
flujo de devolución física. El panel permite reponer una unidad cuando
se agota el stock. Los correos quedan en la bandeja local.

Los datos se guardan en `data/demo.sqlite`. Para una sesión nueva, arranca con
`MOVILITY_DB=:memory:`. El servidor solo escucha en el equipo local.

## GitHub Codespaces

Abre **Terminal → New Terminal** en el editor de Codespaces. En la carpeta
que contiene `package.json`, ejecuta `node -v` y `npm start`. Si Node es
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
