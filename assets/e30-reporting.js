(function attachE30Reporting(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.E30Reporting = api;
})(typeof globalThis === "object" ? globalThis : null, function createE30Reporting() {
  "use strict";

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function branchKey(value) {
    const local = normalize(value && typeof value === "object" ? value.local : value);
    if (local.includes("moreno") || local.includes("piovano")) return "moreno";
    if (local.includes("las flores") || local.includes("demostenes")) return "las flores";
    return null;
  }

  function unassignedMovements(movements) {
    return Array.isArray(movements)
      ? movements.filter((movement) => movement && branchKey(movement) === null)
      : [];
  }

  function summarizeMovements(movements) {
    const summary = { count: 0, income: 0, expense: 0, other: 0 };
    for (const movement of Array.isArray(movements) ? movements : []) {
      if (!movement || typeof movement !== "object") continue;
      const amount = Math.abs(Number(movement.importe) || 0);
      summary.count += 1;
      if (movement.tipo === "Ingreso") summary.income += amount;
      else if (movement.tipo === "Gasto") summary.expense += amount;
      else summary.other += 1;
    }
    return summary;
  }

  return Object.freeze({ branchKey, unassignedMovements, summarizeMovements });
});

