import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const priceSearch = require("../assets/e30-price-search.js");

const prices = [
  { id: 1, marca: "Apple", modelo: "13", reparacion: "Pantalla", precio: 1, activo: true },
  { id: 2, marca: "iPhone", modelo: "13 Pro", servicio: "Pantalla", precio: 2, activo: true },
  { id: 3, marca: "iPhone", modelo: "13", servicio: "Batería", precio: 3, activo: true },
  { id: 4, marca: "Samsung", modelo: "A 55", reparacion: "Pin de carga", precio: 4, activo: true },
  { id: 5, marca: "Motorola", modelo: "G84", servicio: "Centro de carga", precio: 5, activo: true },
  { id: 6, marca: "Samsung", modelo: "A55", servicio: "Pantalla", precio: 6, activo: false },
  { id: 7, marca: "Samsung", modelo: "13", servicio: "Pantalla", precio: 7, activo: true },
];

test("normalizes accents, punctuation, attached model numbers, and common repair terms", () => {
  assert.equal(priceSearch.normalize("iPhone-13Pro DISPLAY"), "iphone 13 pro pantalla");
  assert.equal(priceSearch.normalize("Batería / Cámara"), "bateria camara");
});

test("ranks the exact model ahead of its Pro variant and accepts Apple as iPhone", () => {
  const found = priceSearch.search(prices, "iPhone13 display");
  assert.deepEqual(found.map((item) => item.id), [1, 2]);
  assert.deepEqual(priceSearch.search(prices, "apple 13 pantalla", "iPhone").map((item) => item.id), [1, 2]);
});

test("matches models whether letters and digits are joined, spaced, or hyphenated", () => {
  assert.deepEqual(priceSearch.search(prices, "Samsung-A55 pin de carga").map((item) => item.id), [4]);
  assert.deepEqual(priceSearch.search(prices, "moto g 84 centro de carga").map((item) => item.id), [5]);
});

test("finds order form price suggestions using normalized model, brand, and fault", () => {
  assert.equal(priceSearch.findSuggestion(prices, { model: "iPhone13", brand: "iPhone", description: "Cambio de display" })?.id, 1);
  assert.equal(priceSearch.findSuggestion(prices, { model: "A-55", brand: "Samsung", description: "pin carga" })?.id, 4);
  assert.equal(priceSearch.findSuggestion(prices, { model: "13", description: "pantalla" }), null, "ambiguous brands must not auto-select");
  assert.equal(priceSearch.findSuggestion(prices, { model: "13", brand: "iPhone", description: "" }), null, "an empty fault must not suggest a price");
});

test("returns no match for missing terms or inactive prices", () => {
  assert.deepEqual(priceSearch.search(prices, "A55 camara").map((item) => item.id), []);
  assert.deepEqual(priceSearch.search(prices, "Samsung A55 pantalla").map((item) => item.id), []);
});

