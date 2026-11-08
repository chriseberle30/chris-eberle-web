(function attachE30PriceSearch(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.E30PriceSearch = api;
})(typeof globalThis === "object" ? globalThis : null, function createE30PriceSearch() {
  "use strict";

  const SERVICE_ALIASES = Object.freeze({
    apple: "iphone",
    battery: "bateria",
    camera: "camara",
    display: "pantalla",
    moto: "motorola",
  });

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR")
      .replace(/\b(apple|battery|camera|display|moto)\b/g, (word) => SERVICE_ALIASES[word])
      .replace(/([a-z])([0-9])/g, "$1 $2")
      .replace(/([0-9])([a-z])/g, "$1 $2")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function brandKey(value) {
    return normalize(value);
  }

  function serviceOf(record) {
    return record?.servicio ?? record?.reparacion ?? "";
  }

  function activeRecords(records) {
    return Array.isArray(records) ? records.filter((record) => record && record.activo !== false) : [];
  }

  function brandTokens(records) {
    const tokens = new Set(["apple", "iphone"]);
    for (const record of activeRecords(records)) {
      for (const token of normalize(record.marca).split(" ")) if (token) tokens.add(token);
    }
    return tokens;
  }

  function modelTokens(value, brands) {
    return normalize(value).split(" ").filter((token) => token && !brands.has(token));
  }

  function search(records, query, selectedBrand = "Todos") {
    const active = activeRecords(records);
    const words = normalize(query).split(" ").filter(Boolean);
    const selected = String(selectedBrand || "Todos") === "Todos" ? "Todos" : brandKey(selectedBrand);
    const brands = brandTokens(active);
    const services = new Set(active.flatMap((record) => normalize(serviceOf(record)).split(" ")));
    const modelQuery = words.filter((word) => !brands.has(word) && !services.has(word));
    const matches = active.filter((record) => {
      if (selected !== "Todos" && brandKey(record.marca) !== selected) return false;
      const text = normalize(String(record.marca || "") + " " + String(record.modelo || "") + " " + String(serviceOf(record)));
      return words.every((word) => text.includes(word));
    });
    const score = (record) => {
      const model = modelTokens(record.modelo, brands);
      const missing = modelQuery.filter((word) => !model.includes(word)).length;
      const extra = model.filter((word) => !modelQuery.includes(word)).length;
      return missing * 100 + extra;
    };
    return matches.sort((a, b) => score(a) - score(b)
      || String(a.modelo || "").localeCompare(String(b.modelo || ""), "es", { numeric: true })
      || String(serviceOf(a)).localeCompare(String(serviceOf(b)), "es"));
  }

  function findSuggestion(records, { model, brand = "", description } = {}) {
    const active = activeRecords(records);
    const brands = brandTokens(active);
    const modelKey = modelTokens(model, brands).join(" ");
    const fault = normalize(description);
    if (!modelKey || !fault) return null;
    const faultTokens = new Set(fault.split(" ").filter((token) => !["de", "del", "la", "el", "para"].includes(token)));
    const candidates = active.filter((record) => {
      const serviceTokens = normalize(serviceOf(record)).split(" ").filter((token) => !["de", "del", "la", "el", "para"].includes(token));
      return modelTokens(record.modelo, brands).join(" ") === modelKey
        && serviceTokens.length > 0
        && serviceTokens.every((token) => faultTokens.has(token));
    });
    if (brand) return candidates.find((record) => brandKey(record.marca) === brandKey(brand)) ?? null;
    return candidates.length === 1 ? candidates[0] : null;
  }

  return Object.freeze({ normalize, brandKey, search, findSuggestion });
});

