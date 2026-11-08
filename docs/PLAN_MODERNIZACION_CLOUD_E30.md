# E30 / i30 — Modernización integral (plan de trabajo)

## Objetivo
Evolucionar la aplicación actual sin reemplazarla ni perder funciones o datos. La app de producción sigue siendo `index.html` en `main`. Todo el desarrollo se hace en esta rama y no se publica hasta completar pruebas.

## Qué existe hoy (verificado en el código y Supabase)
- El acceso principal ya utiliza Supabase Auth (`signInWithPassword`) y obtiene el access token de sesión.
- La persistencia de negocio sigue concentrada en `public.e30_kv` (`key text primary key, value jsonb`). En la base consultada es la única tabla pública.
- RLS está activo en `e30_kv` con una política para `authenticated` cuyo JWT email debe ser `chriseberlecontacto@gmail.com`.
- Pero los privilegios SQL de `anon` todavía incluyen SELECT/INSERT/UPDATE/DELETE sobre `e30_kv`. La política RLS debe bloquearlo; igualmente hay que retirar los grants innecesarios y comprobar el rechazo anónimo en una prueba real antes de dar seguridad por cerrada.
- El código ya tiene protección de merge para evitar que un dispositivo pise cambios de otro, refresco cada 120 segundos y al volver a la pestaña, y cola de impresión acotada. No duplicar esas soluciones.
- La exportación actual `E30-copia-YYYY-MM-DD.json` contiene arrays de la app, pero no es un volcado completo de todas las filas de `e30_kv`, credenciales, cola de impresión ni otros valores internos. No sirve como único respaldo de migración.
- Hay actividad/historial básico y pagos parciales dentro de órdenes; hay que normalizarlos sin perder compatibilidad.

## Alcance acordado a partir de la propuesta de Cloud
1. Tablas relacionales reales para órdenes, clientes, sucursales, pagos, costos, ventas, productos/stock, caja y configuración.
2. Numeración de órdenes atómica en la base de datos para evitar duplicados con varios dispositivos.
3. Historial/auditoría y papelera reversible, sin borrado físico accidental.
4. Respaldo diario automático, además de exportación/restauración completa manual y prueba periódica de restauración.
5. Pagos y cobranzas separados de la orden, conservando pagos parciales, saldos y cuentas corrientes de gremio.
6. Actualización en tiempo real con Supabase Realtime, manteniendo un fallback de refresco si se pierde conexión.
7. Experiencia móvil, QR por orden y modo sin conexión con cola de operaciones y resolución de conflictos.
8. Migración en paralelo, validación y corte controlado.

## Orden de implementación
### Fase 0 — Protección y línea base
- Exportar todas las filas de `e30_kv` mediante una extracción autenticada y guardar checksum, fecha, conteo y tamaño.
- Hacer backup de esquema/policies/grants y comprobar que el archivo se puede leer y restaurar en un entorno aislado.
- No usar el JSON exportado por la app como sustituto del backup completo.
- No tocar `main`, producción ni datos reales en esta fase.

### Fase 1 — Esquema paralelo
- Crear tablas normalizadas con `legacy_id` y `legacy_data` para conservar campos actuales.
- Implementar contador transaccional de órdenes.
- Restringir RLS y grants en tablas nuevas.
- La migración SQL adjunta es un borrador de esquema; no debe aplicarse en producción todavía. El contador debe inicializarse con el máximo real importado.

### Fase 2 — Migrador y doble escritura
- Importar una copia de datos en staging.
- Validar recuentos, importes, estados, pagos, costos, movimientos, stock, clientes, presupuestos, actividad y sucursales.
- Implementar adaptador de datos y doble escritura idempotente, con registro de errores y reintentos.
- Mantener `e30_kv` como fuente de verdad durante la transición.

### Fase 3 — Operación y administración
- Pagos/cobranzas y cuentas corrientes de gremio.
- Historial de cambios por orden y usuario.
- Papelera con restauración.
- Backups programados y verificación de restauración.
- Reportes por sucursal y conciliación de caja.

### Fase 4 — Tiempo real y experiencia
- Suscripciones Realtime por entidad; refresco de respaldo al reconectar.
- QR para consulta/identificación de orden sin exponer datos sensibles.
- Offline-first: operaciones locales en cola, IDs idempotentes, indicador de sincronización y resolución explícita de conflictos. No habilitar escrituras offline antes de definir reglas para caja, stock y numeración.
- Ajustes de interfaz móvil sin cambiar flujos ya aprendidos.

### Fase 5 — Corte
- Prueba integral de órdenes, edición, impresión QZ Tray XP-80, comprobante de entrega, garantía, pagos, costos, gremio, caja, stock, ventas, presupuestos y reportes en dos dispositivos.
- Prueba de caída y recuperación de conexión.
- Verificación de acceso anónimo denegado y usuario propietario autorizado.
- Corte solo con backup restaurable y comparación de datos aprobada. Mantener rollback y `e30_kv` intacta durante el período acordado.

## Riesgos que no se van a aceptar
- Cambiar la autenticación sin verificar sesión, expiración y permisos de administración.
- Ejecutar el SQL borrador de seguridad anterior: fue preparado para otro project ref y otra versión de políticas.
- Aplicar migraciones directamente sobre producción sin backup/restauración.
- Cambiar la numeración antes de importar el máximo histórico.
- Borrar registros físicos para implementar papelera.
- Habilitar offline con escrituras ciegas que dupliquen órdenes o alteren stock/caja.
- Reemplazar el `index.html` actual por una versión nueva que no incluya impresión, sucursales, gremio, caja, stock y reportes.

## Criterios de aceptación
- Ninguna orden ni pago desaparece durante sincronización o migración.
- No existen números de orden duplicados bajo creación simultánea.
- Totales y saldos coinciden exactamente antes/después.
- Cada eliminación se puede restaurar y queda auditada.
- Backup completo restaurable demostrado.
- QZ Tray y la XP-80 imprimen desde móvil y notebook.
- Los dos dispositivos ven cambios en tiempo real y recuperan cambios tras desconexión.
- La aplicación actual conserva todas sus pantallas y funciones.
