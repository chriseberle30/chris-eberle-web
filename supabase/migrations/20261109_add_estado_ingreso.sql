-- Gestión E30: datos del estado físico al recibir un equipo
-- Ejecutar en Supabase SQL Editor antes de probar órdenes nuevas.
alter table public.ordenes add column if not exists estado_ingreso text;
