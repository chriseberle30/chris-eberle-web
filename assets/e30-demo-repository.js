(function attachE30DemoRepository(global) {
  "use strict";

  const COLLECTIONS = Object.freeze(["orders", "clients", "stock", "sales", "budgets", "cash"]);
  const VERSION = 1;

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isValidSnapshot(snapshot) {
    if (!isRecord(snapshot) || snapshot.version !== VERSION) return false;
    if (!COLLECTIONS.every((name) => Array.isArray(snapshot[name]))) return false;
    return snapshot.orders.every((order) => isRecord(order)
      && Number.isSafeInteger(Number(order.n))
      && typeof order.modelo === "string"
      && typeof order.estado === "string")
      && snapshot.clients.every((client) => isRecord(client) && typeof client.nombre === "string")
      && snapshot.stock.every((item) => isRecord(item) && Number.isSafeInteger(Number(item.id)) && typeof item.nombre === "string")
      && snapshot.sales.every((sale) => isRecord(sale) && typeof sale.nombre === "string")
      && snapshot.budgets.every((budget) => isRecord(budget) && typeof budget.cliente === "string")
      && snapshot.cash.every((movement) => isRecord(movement) && typeof movement.concepto === "string");
  }

  function createBrowserDemoRepository(storage, storageKey) {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
      throw new TypeError("A browser Storage implementation is required");
    }
    if (typeof storageKey !== "string" || !storageKey.trim()) throw new TypeError("A non-empty storage key is required");

    return Object.freeze({
      loadSnapshot() {
        try {
          const raw = storage.getItem(storageKey);
          if (!raw) return null;
          const snapshot = JSON.parse(raw);
          return isValidSnapshot(snapshot) ? snapshot : null;
        } catch {
          return null;
        }
      },
      saveSnapshot(collections) {
        const snapshot = { version: VERSION };
        for (const name of COLLECTIONS) snapshot[name] = collections[name];
        if (!isValidSnapshot(snapshot)) return { ok: false, reason: "invalid-snapshot" };
        try {
          storage.setItem(storageKey, JSON.stringify(snapshot));
          return { ok: true };
        } catch {
          return { ok: false, reason: "storage-unavailable" };
        }
      },
      reset() {
        try {
          storage.removeItem(storageKey);
          return { ok: true };
        } catch {
          return { ok: false, reason: "storage-unavailable" };
        }
      },
    });
  }

  global.E30DemoRepository = Object.freeze({
    version: VERSION,
    collections: COLLECTIONS,
    createBrowserDemoRepository,
  });
})(window);

