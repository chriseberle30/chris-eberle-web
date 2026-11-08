import test from "node:test";
import assert from "node:assert/strict";
import {
  SnapshotError,
  buildPreview,
  canonical,
  inspectSnapshot,
  readExportDocument,
  reconcileOrderPaymentMovements,
  sha256,
  verifyExports,
} from "./e30_migration.mjs";

function makeExport() {
  return {
    source_project_ref: "source-test",
    captured_at: "2026-11-08T12:00:00.000Z",
    rows: [
      { key: "e30-orders", value: [{
        n: 100, clientId: "C7", cliente: "Cliente fixture", telefono: "000",
        gremio: "", tipoOrden: "Particular", negocio: "i30", local: "Moreno",
        marca: "Apple", modelo: "iPhone fixture", imei: "imei-fixture",
        patron: "1-2-3", desbloqueo: "codigo-fixture", unlockType: "codigo",
        falla: "Pantalla", trabajo: "Reemplazo", estado: "Entregado",
        total: 100, sena: 20, pago: "Efectivo", entrega: "2026-11-01",
        entregada: "2026-11-02T12:00:00.000Z", entregadoPor: "Técnico",
        garantiaDias: 30, obsEquipo: "Marca conservada", obsTecnico: "Nota técnica",
        fecha: "1/11/2026", createdAt: "2026-11-01T10:00:00.000Z",
        costos: [{ concepto: "Repuesto", importe: 25, referencia: "cost-ref" }],
        pagos: [{ id: 301, importe: 30, medio: "Transferencia", fecha: "2/11/2026", hora: "10:30", createdAt: "2026-11-02T10:30:00.000Z", nota: "pago legado" }],
        customField: { keep: true },
      }] },
      { key: "e30-clients", value: [{ id: "C7", nombre: "Cliente fixture", telefono: "000", createdAt: "2026-10-01T00:00:00.000Z", legacyNote: "keep" }] },
      { key: "e30-prices", value: [{ id: 9, marca: "Apple", modelo: "iPhone fixture", reparacion: "Pantalla", precio: 100, activo: true, source: "legacy" }] },
      { key: "e30-stock", value: [{ id: 4, producto: "Repuesto fixture", categoria: "Pantalla", costo: 25, venta: 50, cantidad: 3, activo: true, locationUnknown: "preserve" }] },
      { key: "e30-sales", value: [{ n: 6, productoId: 4, producto: "Repuesto fixture", cantidad: 2, unit: 50, costoUnitario: 25, total: 100, cliente: "Cliente fixture", telefono: "000", pago: "Efectivo", local: "Moreno", fecha: "2/11/2026", createdAt: "2026-11-02T12:00:00.000Z", warranty: "9/11/2026", custom: 1 }] },
      { key: "e30-movements", value: [
        { n: 1, tipo: "Ingreso", concepto: "Cobro orden", importe: 30, pago: "Transferencia", fecha: "2/11/2026", orden: 100, extra: "keep" },
        { n: 2, tipo: "Ingreso", concepto: "Ingreso sin vínculo", importe: 8, pago: "Efectivo", fecha: "2/11/2026" },
        { n: 3, tipo: "Egreso", concepto: "Compra", importe: 12, pago: "Efectivo", fecha: "2/11/2026" },
        { n: 4, tipo: "Ingreso", concepto: "Orden ausente", importe: 7, pago: "Efectivo", fecha: "2/11/2026", orden: 999 },
      ] },
      { key: "e30-activity", value: [{ id: "A1", type: "orden", title: "Estado actualizado", detail: "Fixture", fecha: "2/11/2026", hora: "10:00", createdAt: "2026-11-02T10:00:00.000Z", ref: 100, extra: true }] },
      { key: "e30-budgets", value: [{ n: 2, cliente: "Cliente fixture", telefono: "000", marca: "Apple", modelo: "iPhone fixture", concepto: "Pantalla", precio: 100, negocio: "i30", local: "Moreno", emitida: "1/11/2026", valida: "8/11/2026", estado: "Pendiente", extra: "keep" }] },
      { key: "e30-config", value: { branches: ["E30", "i30"], custom: true } },
      { key: "e30-print-job-fixture", value: { status: "pending", payload: { text: "fixture" } } },
      { key: "e30-admin-pass", value: "never-copy-this-fixture-hash" },
      { key: "unknown-legacy-key", value: { data: "not mapped" } },
    ],
  };
}

test("canonical JSON and SHA-256 are deterministic for object key order", () => {
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  assert.equal(sha256({ b: 2, a: 1 }), sha256({ a: 1, b: 2 }));
});

test("readExportDocument rejects duplicate, missing, or malformed collection keys", () => {
  const valid = makeExport();
  assert.throws(() => readExportDocument({ rows: [...valid.rows, valid.rows[0]] }), SnapshotError);
  assert.throws(() => readExportDocument({ rows: valid.rows.filter((row) => row.key !== "e30-orders") }), /Missing required collections/);
  const wrongType = valid.rows.map((row) => row.key === "e30-orders" ? { ...row, value: {} } : row);
  assert.throws(() => readExportDocument({ rows: wrongType }), /must contain an array/);
});

test("snapshot profile includes row types, counts, project ref, and a content digest", () => {
  const snapshot = makeExport();
  const inspected = inspectSnapshot(snapshot, Buffer.from(JSON.stringify(snapshot)));
  assert.equal(inspected.projectRef, "source-test");
  assert.equal(inspected.capturedAt, "2026-11-08T12:00:00.000Z");
  assert.equal(inspected.profile["e30-orders"].count, 1);
  assert.equal(inspected.profile["e30-admin-pass"].type, "string");
  assert.equal(inspected.datasetSha256, sha256(inspected.values));
  assert.match(inspected.fileSha256, /^[a-f0-9]{64}$/);
});

test("normalized review preserves source payloads and fields across all business collections", () => {
  const source = makeExport();
  const before = JSON.stringify(source);
  const preview = buildPreview(readExportDocument(source).values, source, Buffer.from(JSON.stringify(source)));
  assert.equal(JSON.stringify(source), before, "transform must not mutate source data");
  assert.equal(preview.source.project_ref, "source-test");
  assert.equal(preview.counts.clients, 1);
  assert.equal(preview.counts.orders, 1);
  assert.equal(preview.counts.order_payments, 2);
  assert.equal(preview.counts.order_costs, 1);
  assert.equal(preview.counts.prices, 1);
  assert.equal(preview.counts.stock, 1);
  assert.equal(preview.counts.sales, 1);
  assert.equal(preview.counts.movements, 4);
  assert.equal(preview.counts.activity, 1);
  assert.equal(preview.counts.budgets, 1);
  assert.equal(preview.counts.print_jobs, 1);

  const order = preview.data.orders[0];
  assert.equal(order.client_link_status, "matched");
  assert.equal(order.fields.negocio, "i30");
  assert.equal(order.fields.patron, undefined, "unmodeled fields remain in the source payload, not a guessed normalized column");
  assert.deepEqual(order.legacy_payload, source.rows[0].value[0]);
  assert.deepEqual(order.legacy_payload.customField, { keep: true });
  assert.deepEqual(preview.data.order_payments[0].legacy_payload, {
    sena: 20, pago: "Efectivo", fecha: "1/11/2026",
  });
  assert.deepEqual(preview.data.order_payments[1].legacy_payload, source.rows[0].value[0].pagos[0]);
  assert.deepEqual(preview.data.order_costs[0].legacy_payload, source.rows[0].value[0].costos[0]);
  assert.deepEqual(preview.data.prices[0].legacy_payload, source.rows[2].value[0]);
  assert.deepEqual(preview.data.stock[0].legacy_payload, source.rows[3].value[0]);
  assert.deepEqual(preview.data.sales[0].legacy_payload, source.rows[4].value[0]);
  assert.deepEqual(preview.data.movements[0].legacy_payload, source.rows[5].value[0]);
  assert.deepEqual(preview.data.activity[0].legacy_payload, source.rows[6].value[0]);
  assert.deepEqual(preview.data.budgets[0].legacy_payload, source.rows[7].value[0]);
  assert.deepEqual(preview.data.print_jobs[0].legacy_payload, source.rows[9].value);
  assert.deepEqual(preview.data.configuration, source.rows[8].value);

  const adminHash = preview.data.opaque_keys.find((item) => item.key === "e30-admin-pass");
  assert.equal(adminHash.type, "string");
  assert.equal(adminHash.requires_manual_review, true);
  assert.equal(JSON.stringify(preview).includes("never-copy-this-fixture-hash"), false, "authentication hash must not enter the preview");
  assert.ok(preview.data.opaque_keys.some((item) => item.key === "unknown-legacy-key"));
});

test("financial and payment reconciliation separates deposits from later linked cash", () => {
  const source = makeExport();
  const values = readExportDocument(source).values;
  const reconciliation = reconcileOrderPaymentMovements(values);
  assert.equal(reconciliation.totals.initial_deposits_separate_from_cash_movements, 20);
  assert.equal(reconciliation.totals.later_payments_array, 30);
  assert.equal(reconciliation.totals.linked_income_movements, 30);
  assert.equal(reconciliation.per_order[0].status, "matched");
  assert.equal(reconciliation.income_without_order_reference_count, 1);
  assert.equal(reconciliation.unmatched_order_references.count, 1);
  assert.equal(reconciliation.unmatched_order_references.amount, 7);

  const preview = buildPreview(values, source);
  assert.equal(preview.accounting_reconciliation.review_count, 0);
  assert.equal(preview.financial_summary.orders.billed_total, 100);
  assert.equal(preview.financial_summary.orders.deposit_total, 20);
  assert.equal(preview.financial_summary.orders.payments_array_total, 30);
  assert.equal(preview.financial_summary.stock.purchase_value, 75);
  assert.equal(preview.financial_summary.stock.retail_value, 150);
  assert.equal(preview.financial_summary.sales.gross_total, 100);
  assert.equal(preview.financial_summary.sales.cost_total, 50);
  assert.deepEqual(preview.financial_summary.movements.amount_by_type, { Egreso: 12, Ingreso: 45 });
  assert.ok(preview.warnings.some((warning) => warning.includes("reference an order number absent")));
});

test("unmatched clients, duplicate identities, malformed amounts, and unreconciled cash are reported", () => {
  const source = makeExport();
  const order = source.rows.find((row) => row.key === "e30-orders").value[0];
  order.clientId = "missing-client";
  order.n = 100;
  order.total = -1;
  order.pagos[0].importe = 31;
  source.rows.find((row) => row.key === "e30-orders").value.push({ ...order, pagos: [{ importe: 5, medio: "Efectivo" }], customField: "duplicate order" });
  const preview = buildPreview(readExportDocument(source).values, source);
  assert.ok(preview.warnings.some((warning) => warning.includes("clientId has no matching")));
  assert.ok(preview.warnings.some((warning) => warning.includes("total is invalid or negative")));
  assert.ok(preview.warnings.some((warning) => warning.includes("duplicate legacy_n")));
  assert.ok(preview.warnings.some((warning) => warning.includes("pagos array total differs")));
  assert.equal(preview.accounting_reconciliation.review_count, 2);
});

test("restored export comparison requires the same keys and canonical JSON values", () => {
  const source = makeExport();
  const same = structuredClone(source);
  const different = structuredClone(source);
  different.rows.find((row) => row.key === "e30-orders").value[0].total = 101;
  const result = verifyExports(source, same, Buffer.from(JSON.stringify(source)), Buffer.from(JSON.stringify(same)), {
    sourceProjectRef: "source-test",
    restoredProjectRef: "source-test",
  });
  assert.equal(result.exactMatch, true);
  assert.deepEqual(verifyExports(source, different).differences, ["e30-orders"]);
});

