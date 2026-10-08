# E30 Gestión — auditoría y plan de seguridad

Fecha: 2026-10-08
Repositorio: chriseberle30/chris-eberle-web
Proyecto Supabase: edeaijyayhhijyyjksss

## Hallazgos confirmados

- La app usa directamente la API REST de Supabase desde el navegador y una clave publishable.
- La tabla `public.e30_kv` contiene órdenes, clientes, hashes de contraseñas locales, configuración y trabajos de impresión.
- El login actual compara SHA-256 en el navegador. Esto solo oculta la interfaz; no autentica solicitudes a la base.
- La tabla `public.e30_kv` tiene políticas públicas `SELECT`, `INSERT` y `UPDATE`, todas con predicados `true`.
- La tabla tiene RLS habilitada, pero las políticas públicas hacen que la lectura/inserción/actualización no esté limitada a una identidad autenticada.
- La cola de impresión usa la misma tabla y la aplicación consulta las filas de cola desde el navegador.
- Se creó `public.e30_kv_backup_20261008` y se verificó que tiene 30 filas, igual que la tabla original en el momento de la copia. La tabla de respaldo tiene RLS activada y no tiene políticas.
- Se creó la rama Git `e30-security-fix-2026-10-08` para preparar los cambios aislados.

## No confirmado aún

- No se ha verificado una restauración completa del respaldo.
- No se ha convertido la app a Supabase Auth.
- No se ha probado el login autenticado ni el flujo de impresión bajo una sesión autenticada.
- No se han cambiado las políticas de producción.
- No se ha validado si otras tablas o la app pública comparten permisos o claves; no cambiar esas tablas sin una revisión separada.

## Orden seguro de implementación

1. Exportar los datos de `e30_kv` a un archivo externo verificable, además de la copia SQL.
2. Crear la cuenta de usuario dueño en Supabase Auth desde Dashboard y deshabilitar el registro público.
3. Cambiar la UI de login para usar Supabase Auth, no hashes locales.
4. Hacer que cada llamada REST use el access token de la sesión, nunca la clave publishable como token de usuario.
5. Cambiar las políticas de `e30_kv` a rol `authenticated` y revocar permisos de `anon`.
6. Probar en entorno aislado: inicio/cierre de sesión, lectura, altas y edición de órdenes/clientes/precios/ventas/stock, cola de impresión, trabajos completados y permisos de administrador.
7. Solo con pruebas exitosas, aplicar migración de producción en una ventana controlada.
8. Verificar con solicitudes anónimas que el acceso sea denegado y con la cuenta del dueño que el sistema funciona.
9. Mantener el respaldo hasta completar varios días de uso sin errores.

## Advertencia

El SQL en `supabase/migrations/20261008_e30_security_cutover_DRAFT.sql` es únicamente un borrador de referencia. NO ejecutar en producción antes de convertir y probar el frontend. Si se ejecuta antes, la app actual dejará de poder leer y escribir datos.
