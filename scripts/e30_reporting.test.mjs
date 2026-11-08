import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const reporting = require("../assets/e30-reporting.js");

test("maps known E30 and i30 locations without conflating unknown locations", () => {
  assert.equal(reporting.branchKey("Demóstenes 3101 — Las Flores"), "las flores");
  assert.equal(reporting.branchKey("PIovano 2960 - Moreno"), "moreno");
  assert.equal(reporting.branchKey("Sucursal sin relevar"), null);
  assert.equal(reporting.branchKey(""), null);
});

test("keeps cash movements without a known location separate for branch reporting", () => {
  const movements = [
    { local: "Demóstenes 3101 — Las Flores", tipo: "Gasto", importe: 100 },
    { local: "", tipo: "Gasto", importe: 50 },
    { local: null, tipo: "Ingreso", importe: 25 },
    { local: "Otra dirección", tipo: "Ingreso", importe: 10 },
  ];
  const unassigned = reporting.unassignedMovements(movements);
  assert.equal(unassigned.length, 3);
  assert.deepEqual(reporting.summarizeMovements(unassigned), { count: 3, income: 35, expense: 50, other: 0 });
});

test("summarizes invalid and unknown movement types safely", () => {
  assert.deepEqual(reporting.summarizeMovements([
    { tipo: "Gasto", importe: "-12.5" },
    { tipo: "Ingreso", importe: "8" },
    { tipo: "Ajuste", importe: "5" },
    null,
  ]), { count: 3, income: 8, expense: 12.5, other: 1 });
});

