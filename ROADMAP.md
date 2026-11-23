# Roadmap de lanzamiento de Movility

Objetivo inicial: piloto B2C en Suiza, en alemán y francés, con precios en CHF
y expedición desde el almacén suizo. La expansión a la UE es posterior.
[TAREAS.md](TAREAS.md) recoge el historial y el detalle técnico.

| Orden | Entrega | Estado y dependencias | Aceptación |
| --- | --- | --- | --- |
| 1 | Diagnóstico de preproducción | Implementado. Comprobación repetible con `npm run staging:verify` | Servidor y base responden, DE/FR cargan, el panel requiere autenticación, el sitio queda fuera de indexación y las entradas externas de pago y transporte están cerradas |
| 2 | Privacidad y acceso a pedidos | Ejecutable ahora con datos ficticios | Revisar enlaces de seguimiento y minimización de datos, definir cómo se autorizan y caducan los accesos a documentos y revisar conservación y eliminación |
| 3 | Accesibilidad y calidad móvil | Ejecutable ahora en la tienda. Stripe queda para la validación con cuenta | Compra por teclado en DE/FR, comprobación con lector de pantalla, foco, ampliación, galería, comparador y alternativa textual al 3D |
| 4 | Alojamiento y operación | Preparar configuración y procedimiento ahora. Para desplegar hacen falta proveedor y dominio | Instancia con HTTPS, almacenamiento persistente, aislamiento de entornos, copias automáticas, restauración en una instancia aparte, alertas y reversión ensayadas |
| 5 | Seguridad del equipo y comunicaciones | Preparar cuentas individuales, MFA y permisos. Las pruebas externas dependen del proveedor de identidad y el remitente verificado | Cada persona accede con su cuenta. Se verifica la baja de accesos y la recepción de correo de prueba. Push se comprueba en dispositivos compatibles |
| 6 | Catálogo, facturación y logística comercial | Requiere modelos y materiales definitivos, entidad vendedora, tratamiento fiscal y transportista | Fichas y avisos revisados, facturas y abonos comerciales conciliados, compatibilidad de baterías y un ciclo de entrega y devolución probado |
| 7 | Validación de medios de pago | Aparcada hasta configurar Stripe. Usar cuenta de prueba antes de activar cobros | Probar Visa, Mastercard, TWINT y PayPal. Conciliar cobro, fallo, caducidad y reembolso con inventario y documento |
| 8 | Apertura del piloto suizo | Requiere completar 2–7 y acordar fecha y alcance | Pedido integral revisado. Activar cobro real e indexación de forma controlada. Seguir pagos, correos, entregas y disponibilidad durante el piloto |
| 9 | Expansión a la UE | Después del piloto, por país y ruta logística | Verificar importador, impuestos, aduanas, condiciones y devoluciones antes de habilitar cada ruta |

Las pruebas usan datos ficticios. Los cambios de proveedor, la activación
de cobros reales y la publicación quedan para sus fases respectivas.
