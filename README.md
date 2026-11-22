# Movility

Primer prototipo local del piloto suizo. Requiere Node.js 22.13 o posterior.

```sh
npm start
```

Abre http://127.0.0.1:3000. La tienda tiene un modelo ficticio en alemán y francés,
una unidad disponible y precios en CHF. Prueba con una dirección ficticia como
demo@example.com. Los cuatro métodos de pago son simulados.

El panel está en http://127.0.0.1:3000/admin. El usuario es `admin` y la contraseña
temporal aparece al arrancar. Desde el panel puedes registrar un envío, consultar
la bandeja simulada de confirmación y seguimiento, y registrar el reembolso.
Un reembolso posterior a la expedición conserva el stock hasta que exista un
flujo de devolución física. Los correos quedan en la bandeja local.

Los datos se guardan en `data/demo.sqlite`. Para una sesión nueva, arranca con
`MOVILITY_DB=:memory:`. El servidor solo escucha en el equipo local.

Esta primera entrega prueba el recorrido de pedido. Para el piloto comercial
quedan las integraciones reales, los datos de entrega, la facturación, el
catálogo y multimedia reales, las notificaciones push y la configuración SEO
de producción. El prototipo solicita a los buscadores que no lo indexen.
