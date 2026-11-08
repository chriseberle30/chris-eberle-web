import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../gestion-v2.html", import.meta.url), "utf8");
const app = await readFile(new URL("../assets/gestion-v2.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261108_e30_gestion_priority1.sql", import.meta.url), "utf8");

test("the app is configured for the isolated project and never targets production", () => {
  assert.match(app, /hcwazybjwgvyplxsowgm\.supabase\.co/);
  assert.doesNotMatch(app + html, /tovjxgfxuzoobzpumpbv/);
  assert.match(html, /ENTORNO DE PRUEBAS/);
});

test("every table used by the priority-one app exists in the same migration contract", () => {
  for (const table of ["clientes", "ordenes", "pagos", "precios", "orden_historial"]) {
    assert.match(app, new RegExp(`from\\(["']${table}["']\\)`), `app references ${table}`);
    assert.match(migration, new RegExp(`public\\.${table}\\b`), `migration defines ${table}`);
  }
  for (const feature of ["e30_crear_orden", "e30_registrar_pago", "orden_historial", "cliente_id", "borrada"]) {
    assert.ok(migration.includes(feature), `migration contains ${feature}`);
  }
});

test("the migration is additive and retains legacy order fields", () => {
  assert.doesNotMatch(migration, /\b(drop\s+table|truncate|delete\s+from)\b/i);
  for (const legacyField of ["cliente text", "telefono text", "negocio text", "total numeric", "borrada timestamptz"]) {
    assert.ok(migration.includes(legacyField), `legacy field ${legacyField} is preserved`);
  }
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /to authenticated/i);
});

test("daily management screens and operations are wired in the browser app", () => {
  for (const marker of ["signInWithPassword", "save-client", "create-order", "save-payment", "save-price", "e30_crear_orden", "e30_registrar_pago", "trashOrder", "restoreOrder", "openClient", "openOrder", "printTicket"]) {
    assert.ok(app.includes(marker), `${marker} is wired`);
  }
  for (const table of ["ordenes", "clientes", "precios", "papelera"]) assert.ok(html.includes(`data-view="${table}"`));
});

