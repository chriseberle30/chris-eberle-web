# Migración gradual de E30

Estado relevado el 8 de noviembre de 2026. Documento de planificación: no ejecuta cambios en Supabase.

## Estado verificado

- La aplicación conectada publicada es `index.html` y usa `https://tovjxgfxuzoobzpumpbv.supabase.co`, tabla `public.e30_kv`.
- `index.html` todavía incluye comentarios SQL de una configuración anterior con políticas públicas para `anon`; no coinciden con la política actual relevada en la base (solo dueño autenticado). Esos comentarios no deben ejecutarse como guía de despliegue.
- El proyecto `tovjxgfxuzoobzpumpbv` (“E30 Gestion”) está activo. `public.e30_kv` tiene RLS activo, PK `key` y columnas `key text` / `value jsonb`; contiene 10 claves.
- El proyecto `hcwazybjwgvyplxsowgm` (“E30 Gestión - nuevo”) está activo, pero sus tablas relacionales están vacías. Tiene `e30_kv`, `ordenes`, `pagos` y `precios`; RLS está activo, pero las políticas permiten operaciones globales a cualquier usuario autenticado (`USING true`, `WITH CHECK true`). La tabla `e30_kv` también permite CRUD a `authenticated` con predicados `true`. No debe recibir datos reales ni ser destino de la web hasta revisar y restringir esas políticas.
- En la verificación directa del 8 de noviembre de 2026, el proyecto de producción no expuso una tabla de respaldo en el esquema `public`; el inventario de tablas mostró solo `e30_kv`. La tabla de respaldo descrita en la auditoría de seguridad del 8 de octubre corresponde a su proyecto/ref histórico y no prueba que haya una copia disponible en el proyecto de producción actual. No asumir que existe un backup restaurable.
- En producción, RLS está activo y la única política observada limita operaciones a la identidad propietaria autenticada. Sin embargo, `anon` conserva concesiones de privilegios SQL sobre `e30_kv`; aunque no se observó una política RLS para `anon`, hay que verificar el acceso efectivo desde la API y revocar permisos innecesarios como tarea separada de hardening. No se alteró la base.
- La ruta de prueba `gestion-nueva.html` es independiente, contiene datos ficticios en memoria y no conecta con ninguno de esos proyectos.

## Inventario de datos de producción

Los conteos y tipos se consultaron sin devolver nombres, teléfonos, importes ni contenido de órdenes.

| Clave en `e30_kv` | Estructura | Cantidad | Tratamiento requerido |
| --- | --- | ---: | --- |
| `e30-orders` | Array de objetos | 6 | Importar conservando número, fecha, negocio, cliente/gremio, equipo, falla, estado, entrega, garantía, notas, pagos y costos. |
| `e30-clients` | Array de objetos | 3 | Tabla de clientes; conservar identificador, nombre, teléfono y fecha de alta. Vincular órdenes por `clientId` cuando exista; no deduplicar solo por nombre. |
| `e30-prices` | Array de objetos | 283 | Tabla de precios; conservar ID legado, marca, modelo, reparación, precio y activo. |
| `e30-stock` | Array de objetos | 19 | Catálogo de productos e inventario; conservar ID, categoría, costo, precio de venta, cantidad y activo. |
| `e30-sales` | Array de objetos | 1 | Ventas y detalle de producto; conservar IDs, cantidad, precio unitario, costo unitario, total, cliente, teléfono, medio, local y garantía. |
| `e30-movements` | Array de objetos | 6 | Movimientos de caja; conservar número, tipo, concepto, importe, fecha, medio de pago y vínculo con la orden si aplica. |
| `e30-activity` | Array de objetos | 24 | Historial de actividad; conservar ID, tipo, título, detalle, fecha, hora, fecha ISO y referencia. No regenerar como si fueran eventos nuevos. |
| `e30-print-job-*` | 2 objetos | 2 | Revisar estructura y propósito; preservar como archivos/artefactos legados o exportarlos antes del corte. No hay tabla equivalente en el esquema nuevo. |
| `e30-admin-pass` | String | 1 | Dato de autenticación heredado. No copiarlo a una columna de negocio; definir recuperación y transición de credenciales antes del corte. |

No se encontró una clave `e30-budgets` entre las 10 claves actuales; la aplicación la consulta, pero no hay registros guardados bajo esa clave en el proyecto relevado.

[`scripts/e30_migration.mjs`](scripts/e30_migration.mjs) es el flujo canónico sin dependencias: `node scripts/e30_migration.mjs verify origen.json --compare restaurado.json` compara un snapshot restaurado; `node scripts/e30_migration.mjs preview origen.json --output <ruta-privada>` prepara una transformación offline de revisión. Normaliza pagos/señas y costos por orden, conserva el objeto legado en cada fila y calcula conteos/totales financieros. No es un importador ni genera SQL. El preview contiene teléfonos, IMEI, códigos/patrones y notas de trabajo; debe escribirse fuera del repositorio en almacenamiento privado. Las claves de autenticación solo se identifican por tipo y hash; el snapshot original debe mantenerse bajo acceso restringido.

### Exportación lógica verificable desde la aplicación

En **Configuración → Copia de seguridad**, el botón **Descargar snapshot verificable de e30_kv** lee las filas completas de `public.e30_kv` con la sesión autenticada, en páginas ordenadas. Lee la tabla dos veces y compara el SHA-256 canónico de los valores; si los datos cambian entre lecturas, cancela la descarga. El JSON conserva todas las claves, también las desconocidas, los trabajos de impresión y los hashes de acceso. No modifica Supabase.

Esta descarga es un snapshot íntegro de `e30_kv`, no un backup completo del proyecto Supabase: no incluye usuarios de Auth, objetos de Storage, configuración, roles ni otros esquemas. El archivo contiene datos personales y hashes, por lo que debe permanecer en almacenamiento privado y fuera de Git. Para verificarlo localmente desde la raíz del repositorio en PowerShell:

```powershell
node scripts/e30_migration.mjs verify "$env:USERPROFILE\Downloads\E30-e30_kv-AAAA-MM-DD.json" --expected-source-ref tovjxgfxuzoobzpumpbv
```

La comprobación valida las claves requeridas y muestra conteos y SHA-256 sin imprimir los valores. Antes de una migración sigue siendo obligatorio restaurar el backup en un proyecto aislado y comparar esa exportación restaurada con `--compare`.

## Compatibilidad del esquema

El esquema vacío actual no alcanza para representar lo que usa producción:

- `ordenes` incluye una parte de los campos de recepción y trabajo, pero no todos los campos de legado como `patron`, `unlockType`, `desbloqueo`, `obsEquipo`, `obsTecnico`, `costos` (array), `sena`, `pago`, `entrega`, `entregadoAt`, `entregadoPor`, `garantiaDias`, `local` y `tipoOrden`.
- `pagos` relaciona importes con `ordenes`; `sena` y el array `pagos` son componentes distintos del cobro y deben conservarse por separado.
- `clientes` no existe en el proyecto nuevo, aunque hay tres clientes y órdenes con `clientId`.
- No existen tablas relacionales para stock, ventas, movimientos de caja, actividad, presupuestos ni trabajos de impresión.
- `precios` contiene marca, modelo, servicio, precio y activo; el legado llama `reparacion` al servicio y usa IDs numéricos que conviene conservar como `legacy_id` para poder reconciliar.
- La orden nueva tiene una FK desde `pagos`, pero todavía hace falta definir integridad de negocio, historial de estados, desglose de costos, ventas con sus ítems y referencias a cliente/producto.

### Regla de cobros y caja confirmada en el código de producción

`paymentTotal()` suma `orden.sena` más los elementos de `orden.pagos`. La creación de una orden guarda la seña dentro de `sena` y comienza con `pagos: []`; esa ruta no crea un movimiento de caja. En cambio, los flujos de cobro posterior agregan un elemento a `pagos` y un movimiento `Ingreso` con el campo `orden` apuntando al número de orden. Las ventas se guardan en `e30-sales` y ajustan stock, pero no crean movimientos de caja en esa ruta.

Implicaciones para migrar:

- Convertir `sena` en un pago inicial separado y preservar su fecha/medio disponibles; no crear por inferencia un movimiento de caja para ese valor.
- Comparar el total de `pagos[]` con los movimientos `Ingreso` que refieren esa orden. Las diferencias quedan en revisión; no corregirlas ni completar movimientos automáticamente.
- Mantener ventas, movimientos y cobros de órdenes como colecciones separadas; no sumar la venta otra vez como movimiento al conciliar.
- Los movimientos sin `orden` y los que refieren números de orden inexistentes requieren conservarse y revisarse, no descartarse ni enlazarse por coincidencia de concepto.

El preview offline de [`scripts/e30_migration.mjs`](scripts/e30_migration.mjs) incluye `accounting_reconciliation`: separa señas, compara pagos posteriores con movimientos vinculados por orden e informa diferencias sin alterar importes. La suite [`scripts/e30_migration.test.mjs`](scripts/e30_migration.test.mjs) contiene siete pruebas sintéticas ejecutables con `node --test scripts/e30_migration.test.mjs`; las siete pasan. Cubren preservación de `legacy_payload`, datos opacos, datos desconocidos, conciliación y verificación de copias. Falta ejecutarla con el export real privado y validar una restauración completa.

## Modelo objetivo antes de importar

Diseñar y aprobar el modelo relacional completo antes de transformar datos. Como mínimo:

1. `clientes` con ID legado único y teléfono normalizado de forma auxiliar (sin reemplazar el dato original).
2. `ordenes` con `legacy_n`, `client_id` nullable, negocio, tipo, datos del equipo, recepción, diagnóstico, estado actual, totales y fechas originales.
3. `orden_pagos` con importe, método y fechas; separar cada pago y mapear `sena` una sola vez.
4. `orden_costos` para cada elemento del array `costos`, más un total calculado reconciliable.
5. `precios` con ID legado, marca, modelo, reparación, precio y activo.
6. `productos` y un registro de inventario inicial que conserve cantidades/costo/venta; definir si las ventas futuras generan movimientos de stock.
7. `ventas` y `venta_items` (o equivalente) con precio y costo históricos por unidad.
8. `movimientos_caja` con referencias opcionales a orden/venta y datos históricos originales.
9. `actividad` como registro histórico inmutable con referencias opcionales.
10. Resolver por separado presupuestos (sin registros encontrados actualmente), impresión y autenticación.

Todo registro importado debe tener un identificador de origen estable (clave de colección + ID legado o número) y una restricción única que haga segura la reejecución de la importación. No se deben recalcular silenciosamente precios, costos, saldos ni fechas históricas.

## Secuencia segura de migración

1. **Elegir un método de backup completo:** la copia lógica `supabase db dump` excluye por defecto los esquemas administrados `auth` y `storage`, además de extensiones, y no incluye roles salvo que se soliciten por separado. Los objetos almacenados por Storage tampoco están dentro del backup de base de datos. La aplicación sí depende de Supabase Auth; por lo tanto, el dump de `public` solo no es suficiente para restaurar todo el sistema. Usar una copia/duplicado gestionado por Supabase cuando el plan lo permita, o documentar y exportar por separado Auth, personalizaciones de `auth`/`storage`, archivos de Storage, roles, configuración del proyecto y funciones. Revisar el procedimiento y las limitaciones en la [guía oficial de backups](https://supabase.com/docs/guides/platform/backups), [backup y restore con CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) y [duplicar proyecto](https://supabase.com/docs/guides/platform/clone-project).
2. **Congelar el inventario de origen:** guardar exportación completa y configuración en almacenamiento privado; incluir DDL, políticas, extensiones, roles y dependencias necesarias. No incluir backups, datos personales ni credenciales en el repositorio.
3. **Verificar el backup:** calcular SHA-256, registrar fecha/origen, restaurar en un proyecto aislado y comparar datos y configuración. El modo `verify` de [`scripts/e30_migration.mjs`](scripts/e30_migration.mjs) valida y compara claves/valores JSONB de `e30_kv` sin imprimir contenido personal; es una verificación de esa tabla y no reemplaza la restauración completa ni las pruebas de Auth/Storage. La lógica de transformación se verificó con registros sintéticos; todavía no se ha ejecutado sobre una exportación real.
4. **Preparar staging aislado:** crear/seleccionar un proyecto de pruebas; cerrar políticas permisivas; probar con usuario autenticado permitido, usuario autenticado ajeno y `anon`. No copiar secretos de autenticación de producción.
5. **Completar el esquema y el importador:** mapear explícitamente cada campo y cada clave. Los campos desconocidos deben ir a un reporte de discrepancias; no descartarse.
6. **Ensayar importaciones repetibles:** restaurar el mismo snapshot varias veces; comprobar que no duplica órdenes, pagos, stock, ventas ni actividad.
7. **Reconciliar:** comparar cantidades por colección, IDs/números de órdenes y precios, stock por producto, ventas, pagos, costos y movimientos por tipo/medio/período. Verificar también `sena` por separado, `pagos[]` contra movimientos de cobro vinculados, ventas contra stock y movimientos manuales sin referencia. Registrar nulos y excepciones explicadas; no sintetizar movimientos para igualar totales.
8. **Validar la aplicación en staging:** ejecutar flujos de recepción, edición, estado, entrega, pago parcial/final, consulta de historial, venta, baja de stock, ajuste de inventario, egreso/ingreso y cierre/reporte de caja; verificar RLS en cada rol y vista móvil/escritorio.
9. **Corte reversible:** conservar `index.html`, la tabla `e30_kv` y el proyecto de producción sin cambios durante el piloto. Cambiar el tráfico solo con backup restaurable y reconciliación aprobada; mantener el camino de vuelta y no borrar el legado durante el período de estabilización.

## Condiciones de no-go

No conectar ni publicar la aplicación nueva con datos reales mientras falte cualquiera de estos puntos:

- backup completo restaurado y verificado;
- destino y proyecto de Supabase confirmados;
- esquema destino completo para todas las colecciones existentes;
- políticas RLS por operación y autorización, sin reglas globales permisivas;
- importación repetible con informe de discrepancias vacío o aceptado;
- conciliación de conteos y montos aprobada;
- pruebas de permisos, seguridad, recorridos de negocio y recuperación;
- procedimiento y responsable para volver a `index.html` y a la base original.

