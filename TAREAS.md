# Tareas de Movility

El primer lanzamiento se hará en Suiza, con stock en Suiza, alemán y francés,
precios en CHF y pago con TWINT, PayPal, Visa y Mastercard. El trabajo de
desarrollo puede avanzar con datos ficticios. Para abrir pedidos reales se
confirmarán la entidad vendedora, el dominio y los proveedores comerciales.

## Base disponible

- [x] Portada, ficha, carrito, checkout invitado y seguimiento en alemán y francés.
- [x] Catálogo de prueba, edición de precio y traducciones, control de stock y pedidos.
- [x] Comparador de demostración, galería, visor GLB y soporte de vídeo subtitulado.
- [x] Metadatos bilingües, sitemap configurable y protección contra indexación de la demo.
- [x] Registro de cobros simulados, expediciones, reembolsos y desglose por método.

## Cola de implementación

- [x] **1. Correos postcompra de prueba.** Generar confirmación, expedición y
  reembolso en el idioma del pedido. Poder abrir el correo completo desde el
  panel y conservar una sola copia por evento. Aceptación: importe y seguimiento
  corresponden al evento y se pueden consultar también en pedidos anteriores.
- [x] **2. Catálogo de 1–10 modelos y carrito.** Crear, editar y archivar
  modelos con SKU, existencias, fichas DE/FR, precio, especificaciones, galería,
  vídeo y GLB propios. Conectar el comparador al catálogo publicado y permitir
  un carrito con varias referencias. Aceptación: despublicar un modelo bloquea
  nuevas compras y preserva los pedidos anteriores, y dos compras simultáneas
  no venden dos veces la misma unidad.
  - [x] Modelos con SKU, ficha bilingüe, precio, stock, características, publicación y archivo.
  - [x] Integración con el comparador y compra de un modelo con stock independiente e historial.
  - [x] Galería, vídeo subtitulado, transcripción y visor GLB opcionales por modelo mediante archivos asociados al SKU.
  - [x] Carrito con varias referencias, cantidades y comprobación transaccional de stock y precios.
- [x] **3. Administración y analítica.** Añadir movimientos de stock y
  devoluciones físicas, trazabilidad por serie cuando aplique, roles, filtros
  y exportación contable. Medir ventas netas y el embudo con el consentimiento
  aplicable. Aceptación: el panel y los informes cuadran con pedidos y abonos,
  y cada rol solo tiene acceso a sus operaciones.
  - [x] Historial de stock filtrable por SKU, saldos de apertura y exportación de movimientos.
  - [x] Recepción parcial por modelo con reposición de unidades aptas y separación de unidades en revisión.
  - [x] Exportación de conciliación de cobros y reembolsos en CHF, filtrable por fecha y medio de pago.
  - [x] Trazabilidad por número de serie en expediciones y devoluciones, con búsqueda de historial.
  - [x] Roles de demostración con permisos de catálogo, almacén, atención y finanzas comprobados en cada ruta. Cuentas individuales y MFA para producción.
  - [x] Analítica del embudo con consentimiento, retirada y tasas agregadas por idioma y periodo.
- [ ] **4. Automatizaciones e integraciones.** Conectar el correo transaccional
  y el transportista, registrar reintentos y errores, y añadir push voluntario
  con baja. Aceptación: un evento duplicado no genera dos envíos, se pueden
  reintentar fallos y el correo sigue disponible para quien no active push.
  El envío de correos reales depende de una cuenta y un remitente autorizados.
  - [x] Cola de entrega simulada con identidad por aviso, reintentos, recuperación tras interrupción e historial.
  - [x] Adaptador Resend con modo de prueba, destinatario fijo y deduplicación dentro de la ventana del proveedor.
  - [ ] Verificar remitente y recepción con cuenta y dirección de prueba autorizadas.
  - [x] Seguimiento simulado y adaptador firmado de eventos de tránsito, entrega e incidencia, con deduplicación y aviso de entrega.
  - [ ] Conectar el transportista elegido y validar eventos en su entorno de pruebas.
  - [x] Push voluntario para expedición y entrega, con alta y baja por pedido, mensajes genéricos y cola de reintentos.
  - [ ] Validar la recepción real de push en navegadores y dispositivos del piloto con HTTPS.
- [ ] **5. Pagos suizos.** Conectar TWINT, PayPal y tarjetas en entorno de
  pruebas, verificar notificaciones firmadas y conciliar devoluciones.
  Aceptación: probar cobro, fallo, cancelación y reembolso para los cuatro
  métodos. La activación comercial depende de la entidad, la cuenta de
  liquidación y la aprobación de los proveedores.
  - [x] Stripe Checkout de prueba en CHF con reserva de stock, firma de eventos y registro único por cobro. Tarjeta por defecto; TWINT y PayPal sujetos a la configuración de la cuenta.
  - [ ] Reembolsos y conciliación Stripe. Usar el identificador del PaymentIntent guardado, verificar el resultado firmado y reponer stock una sola vez si el pedido no salió.
  - [ ] Probar Visa, Mastercard, TWINT y PayPal de extremo a extremo con una cuenta de prueba que tenga los métodos habilitados.
- [ ] **6. Preparación del piloto.** Cargar fotos, vídeos, GLB y datos reales.
  Validar fiscalidad suiza, facturas y abonos, devoluciones, clasificación y
  documentación del producto, y transporte de baterías. Verificar privacidad,
  seguridad, restauración, SEO y accesibilidad WCAG 2.2 AA con pruebas manuales.
  Aceptación: pedido de prueba conciliado con pago, documento y expedición en
  el dominio definitivo, antes de abrir los cobros reales y la indexación.
- [ ] **7. Expansión a la UE.** Validar cada país y ruta desde Suiza, quién
  importa, IVA, aduanas, costes completos y devoluciones antes de habilitarlos.
  Aceptación: pedido y devolución de prueba por ruta con documentación
  conciliada y condiciones traducidas y revisadas.
