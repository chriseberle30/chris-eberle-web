/* Reglas compartidas de validación y presentación para Gestión E30. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.E30Gestion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BRANCHES = ["E30", "i30"];
  const ORDER_STATES = ["Recibido", "Pendiente", "Esperando repuesto", "En reparación", "Listo", "Entregado", "No reparable", "Cancelado"];
  const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Mercado Pago", "Tarjeta"];
  const clean = (value) => String(value ?? "").trim();
  const amount = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : NaN;
  };
  const normalizedPhone = (value) => clean(value).replace(/\D/g, "");
  function validateClient(input) {
    const nombre = clean(input.nombre);
    if (nombre.length < 2) throw new Error("Ingresá el nombre del cliente.");
    if (nombre.length > 120) throw new Error("El nombre supera los 120 caracteres.");
    const telefono = clean(input.telefono);
    if (telefono.length > 40) throw new Error("El teléfono supera los 40 caracteres.");
    const email = clean(input.email);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("El email no tiene un formato válido.");
    return { nombre, telefono: telefono || null, email: email || null, notas: clean(input.notas) || null };
  }
  function validateOrder(input) {
    const branch = clean(input.negocio);
    if (!BRANCHES.includes(branch)) throw new Error("Elegí una sucursal válida.");
    const modelo = clean(input.modelo);
    const falla = clean(input.falla);
    if (!modelo) throw new Error("Ingresá el modelo del equipo.");
    if (!falla) throw new Error("Describí la falla.");
    const total = amount(input.total);
    const deposit = amount(input.sena || 0);
    if (!Number.isFinite(total) || total < 0) throw new Error("El total debe ser cero o mayor.");
    if (!Number.isFinite(deposit) || deposit < 0 || deposit > total) throw new Error("La seña debe estar entre cero y el total.");
    return { negocio: branch, modelo, falla, total, sena: deposit };
  }
  function validatePayment(input, balance) {
    const importe = amount(input.importe);
    if (!Number.isFinite(importe) || importe <= 0) throw new Error("El pago debe ser mayor que cero.");
    if (importe > amount(balance) + 0.0001) throw new Error("El pago supera el saldo pendiente.");
    const medio = clean(input.medio);
    if (!PAYMENT_METHODS.includes(medio)) throw new Error("Elegí un medio de pago válido.");
    return { importe, medio };
  }
  function paid(order) { if (order.estado === "Entregado") return Math.max(0, Number(order.total) || 0); return (order.pagos || []).reduce((sum, item) => sum + (Number(item.importe) || 0), 0); }
  function balance(order) { return Math.max(0, (Number(order.total) || 0) - paid(order)); }
  function searchText(row) { return [row.id, row.nombre, row.cliente, row.telefono, row.modelo, row.falla, row.gremio].filter(Boolean).join(" ").toLocaleLowerCase("es-AR"); }
  return { BRANCHES, ORDER_STATES, PAYMENT_METHODS, validateClient, validateOrder, validatePayment, paid, balance, searchText, normalizedPhone };
});

