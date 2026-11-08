import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rules = require("../assets/e30-gestion-domain.js");

test("client validation trims fields and rejects invalid names and email", () => {
  assert.deepEqual(rules.validateClient({ nombre: " Ana ", telefono: " 123 ", email: " ana@example.com " }), {
    nombre: "Ana", telefono: "123", email: "ana@example.com", notas: null,
  });
  assert.throws(() => rules.validateClient({ nombre: "A" }), /nombre/);
  assert.throws(() => rules.validateClient({ nombre: "Ana", email: "mal" }), /email/);
});

test("orders only accept supported branches and nonnegative bounded amounts", () => {
  assert.equal(rules.validateOrder({ negocio: "i30", modelo: "13", falla: "Pantalla", total: "100", sena: "25" }).sena, 25);
  assert.throws(() => rules.validateOrder({ negocio: "otra", modelo: "13", falla: "Pantalla", total: 100 }), /sucursal/);
  assert.throws(() => rules.validateOrder({ negocio: "E30", modelo: "13", falla: "Pantalla", total: 100, sena: 101 }), /seña/);
});

test("payments cannot be zero, exceed balance, or use unknown methods", () => {
  assert.deepEqual(rules.validatePayment({ importe: 20, medio: "Efectivo" }, 20), { importe: 20, medio: "Efectivo" });
  assert.throws(() => rules.validatePayment({ importe: 0, medio: "Efectivo" }, 20), /mayor que cero/);
  assert.throws(() => rules.validatePayment({ importe: 21, medio: "Efectivo" }, 20), /supera el saldo/);
  assert.throws(() => rules.validatePayment({ importe: 2, medio: "Cheque" }, 20), /medio de pago/);
});

test("balance and search include payment totals and common customer/order fields", () => {
  const order = { id: 17, cliente: "Ana", telefono: "123", modelo: "iPhone 13", falla: "Pantalla", total: 100, pagos: [{ importe: 25 }, { importe: "15" }] };
  assert.equal(rules.paid(order), 40);
  assert.equal(rules.balance(order), 60);
  assert.match(rules.searchText(order), /iphone 13/);
  assert.equal(rules.normalizedPhone("+54 (11) 123"), "5411123");
});

