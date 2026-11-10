(() => {
  "use strict";

  // Esta app de esta rama apunta solo al proyecto aislado de pruebas.
  const SUPABASE_URL = "https://zpuwfzdxyvltrtkikvsu.supabase.co";
  const SUPABASE_KEY = "sb_publishable_F8lLX0s3FyLShFW2ceB9Tw_yyJRRZ5K";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const Rules = window.E30Gestion;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = (value) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value) || 0);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  const date = (value) => value ? new Date(value).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", hour12: false }) : "—";
  const stateClass = (state) => ({ "Listo":"ready", "En reparación":"repair", "Esperando repuesto":"waiting", "Pendiente":"delayed", "Recibido":"received", "Entregado":"closed", "No reparable":"unrepairable", "Cancelado":"closed" }[state] || "");
  const data = { clients: [], orders: [], prices: [], trash: [], cash: [], stockItems: [], sales: [], claims: [], view: "inicio", busy: false, queryTimer: null };

  function notice(message, error = false) {
    const box = $("#notice"); box.textContent = message; box.classList.toggle("error", error); box.hidden = false;
    clearTimeout(notice.timer); notice.timer = setTimeout(() => { box.hidden = true; }, error ? 6500 : 3200);
  }
  function setConnected(value, label) {
    $("#connection-label").textContent = label;
    $(".connection-dot").className = `connection-dot ${value}`;
  }
  function showLogin(error = "") {
    $("#loading-screen").hidden = true; $("#app").hidden = true; $("#login-screen").hidden = false;
    $("#login-error").textContent = error;
  }
  function showApp(session) {
    $("#loading-screen").hidden = true; $("#login-screen").hidden = true; $("#app").hidden = false;
    $("#user-label").textContent = session?.user?.email || "Sesión activa";
  }
  function openModal(title, eyebrow, body, actions) {
    $("#modal-title").textContent = title; $("#modal-eyebrow").textContent = eyebrow;
    $("#modal-body").innerHTML = body; $("#modal-actions").innerHTML = actions;
    const modal = $("#modal"); if (!modal.open) modal.showModal();
  }
  function closeModal() { const modal = $("#modal"); if (modal.open) modal.close(); }
  function formField(label, name, value = "", type = "text", extra = "") {
    return `<div class="field ${extra}"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}"></div>`;
  }
  function selectField(label, name, options, selected, extra = "") {
    return `<div class="field ${extra}"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options.map((value) => `<option ${value === selected ? "selected" : ""}>${esc(value)}</option>`).join("")}</select></div>`;
  }
  function actionButtons(cancel = "Cancelar", save = "Guardar") {
    return `<button class="button" type="button" data-close>${cancel}</button><button class="button primary" type="submit">${save}</button>`;
  }

  async function loadOrders({ trash = false, search = "" } = {}) {
    let query = sb.from("ordenes").select("*,pagos(id,importe,medio,creado),clientes(id,nombre,telefono)").order("id", { ascending: false }).limit(500);
    query = trash ? query.not("borrada", "is", null) : query.is("borrada", null);
    const idSearch = search.trim();
    const words = idSearch.split(/\s+/).filter(Boolean).slice(0, 4);
    for (const word of words) {
      const safe = word.replace(/[(),.*%_]/g, " ").trim(); if (!safe) continue;
      const idClause = /^\d+$/.test(safe) ? `id.eq.${Number(safe)},` : "";
      query = query.or(`${idClause}cliente.ilike.%${safe}%,telefono.ilike.%${safe}%,modelo.ilike.%${safe}%,falla.ilike.%${safe}%,gremio.ilike.%${safe}%`);
    }
    const { data: rows, error } = await query;
    if (error) throw error;
    return rows || [];
  }
  async function refresh() {
    try {
      refresh.last = Date.now(); setConnected("", "Actualizando…");
      const [orders, clients, prices, trash, cash, stockItems, sales, claims] = await Promise.all([
        loadOrders(),
        sb.from("clientes").select("id,nombre,telefono,email,notas,creada,actualizada").order("nombre").limit(1000),
        sb.from("precios").select("id,marca,modelo,servicio,precio,activo").order("modelo").limit(3000),
        loadOrders({ trash: true }),
        sb.from("caja_movimientos").select("*").order("creado",{ascending:false}).limit(1500),
        sb.from("stock_items").select("*").order("nombre").limit(2000),
        sb.from("ventas").select("*,venta_items(*)").order("creado",{ascending:false}).limit(1000),
        sb.from("reclamos_garantia").select("*,ordenes(id,modelo,cliente,gremio,negocio,garantia_dias)").order("creado",{ascending:false}).limit(1000),
      ]);
      if (clients.error) throw clients.error;
      if (prices.error) throw prices.error;
      if (cash.error) throw cash.error; if (stockItems.error) throw stockItems.error; if (sales.error) throw sales.error; if (claims.error) throw claims.error;
      data.orders = orders; data.clients = clients.data || []; data.prices = prices.data || []; data.trash = trash;
      data.cash = cash.data || []; data.stockItems = stockItems.data || []; data.sales = sales.data || []; data.claims = claims.data || [];
      setConnected("ok", "Conectado"); renderCurrent(); renderStats(); renderDashboard(); renderCash(); renderStock(); renderSales(); renderClaims(); renderReports();
    } catch (error) {
      setConnected("bad", "Revisar configuración");
      const message = /clientes|schema cache|relation/i.test(error.message || "")
        ? "El esquema de pruebas necesita la migración de Gestión v2. No se aplicó automáticamente."
        : `No se pudieron cargar los datos: ${error.message || error}`;
      notice(message, true);
    }
  }
  function renderDashboard() {
    if (!$("#home-orders-list")) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const income = data.cash.filter(x => x.tipo === "Ingreso" && new Date(x.creado) >= today).reduce((sum,x) => sum + Number(x.importe || 0),0);
    const active = data.orders.filter(x => !["Entregado","No reparable","Cancelado"].includes(x.estado));
    $("#home-income").textContent = money(income);
    $("#home-active").textContent = active.length;
    $("#home-ready").textContent = active.filter(x => x.estado === "Listo").length;
    const recent = [...active].sort((a,b) => new Date(b.creada || 0) - new Date(a.creada || 0)).slice(0,8);
    $("#home-orders-list").innerHTML = recent.map(order => {
      const client = order.clientes?.nombre || order.cliente || order.gremio || "Cliente sin nombre";
      const phone = formatPhone(order.telefono || order.clientes?.telefono || "");
      const model = order.modelo || "Equipo sin modelo"; const fault = order.falla || "Trabajo sin descripción";
      const balance = Rules.balance(order);
      return `<article class="order-row home-order-row" data-order="${order.id}">
        <span class="home-order-number">#${order.id}</span>
        <div class="row-main home-order-copy"><b class="home-device-model">${esc(model)}</b><span class="home-device-fault">${esc(fault)}</span><small>${esc(client)} · ${esc(phone || "Sin teléfono")} · ${date(order.creada)}</small></div>
        <div class="home-order-meta"><button type="button" class="state-pill state-pill-action ${stateClass(order.estado)}" data-quick-state="${order.id}" aria-label="Cambiar estado de la orden ${order.id}">${esc(order.estado || "Pendiente")} <span aria-hidden="true">▾</span></button><span class="branch-pill">${esc(order.negocio || "")}</span></div>
        <div class="home-order-balance"><b>${money(balance > 0 ? balance : order.total)}</b><small>${balance > 0 ? "Saldo pendiente" : "Total"}</small></div>
      </article>`;
    }).join("") || '<div class="empty-state">No hay órdenes activas. Cuando ingreses un equipo, aparecerá acá.</div>';
  }
  function renderStats() {
    const active = data.orders.filter((order) => !["Entregado", "No reparable", "Cancelado"].includes(order.estado));
    $("#stat-active").textContent = active.length;
    $("#stat-ready").textContent = active.filter((order) => order.estado === "Listo").length;
    $("#stat-balance").textContent = money(active.reduce((sum, order) => sum + Rules.balance(order), 0));
  }
  function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("549") && digits.length >= 12) return "+54 9 " + digits.slice(3,5) + " " + digits.slice(5);
    if (digits.startsWith("54") && digits.length >= 11) return "+54 " + digits.slice(2,4) + " " + digits.slice(4);
    if (digits.startsWith("0") && digits.length >= 10) return digits.slice(0,2) + " " + digits.slice(2,6) + "-" + digits.slice(6);
    if (digits.length === 10) return digits.slice(0,2) + " " + digits.slice(2,6) + "-" + digits.slice(6);
    return digits;
  }
  function renderOrders(rows = data.orders, target = "#orders-list") {
    const branch = $("#branch-filter")?.value || "";
    const state = $("#state-filter")?.value || "";
    const filtered = rows.filter((order) => (!branch || order.negocio === branch) && (!state || order.estado === state));
    $("#order-count").textContent = `${filtered.length} ${filtered.length === 1 ? "orden" : "órdenes"}`;
    $(target).innerHTML = filtered.map((order) => {
      const client = order.clientes?.nombre || order.cliente || order.gremio || "Cliente sin nombre";
      const phone = formatPhone(order.telefono || order.clientes?.telefono || "");
      const deviceWork = `${order.modelo || "Equipo sin modelo"} · ${order.falla || "Trabajo sin descripción"}`;
      const due = Rules.balance(order);
      return `<article class="order-row" data-order="${order.id}"><b class="order-no">#${order.id}</b><div class="row-main"><b>${esc(deviceWork)}</b><small>${esc(client)} · ${esc(phone || "Sin teléfono")} · ${date(order.creada)}</small></div><div class="row-main hide-mobile"><b>${esc(order.estado || "")}</b><small>${esc(order.negocio || "")}</small></div><div><span class="state-pill ${stateClass(order.estado)}">${esc(order.estado)}</span><span class="branch-pill">${esc(order.negocio)}</span></div><div class="money"><b>${money(order.total)}</b>${due > 0 ? `<small>Debe ${money(due)}</small>` : "<small style=\"color:#17805f\">Saldo cubierto</small>"}</div></article>`;
    }).join("") || `<div class="empty-state">${rows.length ? "No hay resultados con estos filtros." : "Todavía no hay órdenes para mostrar."}</div>`;
  }
  function renderClients(search = "") {
    const terms = search.toLocaleLowerCase("es-AR").trim().split(/\s+/).filter(Boolean);
    const rows = data.clients.filter((client) => terms.every((term) => `${client.nombre} ${client.telefono || ""} ${client.email || ""}`.toLocaleLowerCase("es-AR").includes(term)));
    $("#clients-list").innerHTML = rows.map((client) => {
      return `<article class="client-card" data-client="${esc(client.id)}"><b>${esc(client.nombre)}</b><span>${esc(client.telefono || "Sin teléfono")}${client.email ? ` · ${esc(client.email)}` : ""}</span><span class="client-orders">Ver historial de reparaciones</span></article>`;
    }).join("") || `<div class="empty-state">No hay clientes. Creá uno para asociarlo a una orden.</div>`;
  }
  function renderPrices(search = "") {
    const words = search.toLocaleLowerCase("es-AR").split(/\s+/).filter(Boolean);
    const category = (document.querySelector(".filter-chip.active")?.dataset.priceCategory || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const collator = new Intl.Collator("es-AR", { numeric: true, sensitivity: "base" });
    const rows = data.prices.filter((price) => {
      const haystack = `${price.marca || ""} ${price.modelo || ""} ${price.servicio || ""}`.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (!words.every((word) => haystack.includes(word))) return false;
      if (!category) return true;
      if (category === "otro") return !/(pantalla|display|bater|camara|carga|pin)/i.test(haystack);
      return haystack.includes(category);
    }).sort((a,b) => {
      return collator.compare(a.marca || "iPhone", b.marca || "iPhone") || collator.compare(a.modelo || "", b.modelo || "") || collator.compare(a.servicio || "", b.servicio || "");
    });
    $("#price-count").textContent = `${rows.length} tarifas`;
    $("#prices-list").innerHTML = rows.slice(0, renderPrices.limit || 80).map((price) => {
      const brand = String(price.marca || "iPhone"), model = String(price.modelo || "");
      const title = model.toLowerCase().startsWith(brand.toLowerCase()) ? model : `${brand} ${model}`.trim();
      return `<article class="order-row price-row${price.activo ? "" : " paused"}"><div class="row-main price-device"><b>${esc(title)}</b><small>${esc(price.servicio)}${price.activo ? "" : " · En pausa"}</small></div><div class="money price-value"><b>${money(price.precio)}</b></div><button class="icon-copy" type="button" data-copy-price="${price.id}" aria-label="Copiar precio"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg></button><div class="price-actions"><button class="button" data-edit-price="${price.id}">Editar</button><button class="button ${price.activo ? "danger" : ""}" data-toggle-price="${price.id}" data-active="${price.activo}">${price.activo ? "Pausar" : "Activar"}</button></div></article>`;
    }).join("") + (rows.length > (renderPrices.limit || 80) ? `<button class="button more-prices" type="button" data-more-prices="1">Mostrar más (${rows.length - (renderPrices.limit || 80)} restantes)</button>` : "") || `<div class="empty-state">${data.prices.length ? "No encontramos precios con esa búsqueda o categoría." : 'Todavía no hay tarifas cargadas.<div class="empty-actions"><button class="button primary" data-empty-add-price>＋ Agregar tarifa</button><button class="button" data-empty-bulk-price>Carga masiva</button></div>'}</div>`;
  }
  function openBulkPriceImport() {
    const body = '<p class="muted">Importá un CSV con columnas: marca, modelo, servicio, precio. La importación agrega tarifas; no modifica ni elimina las existentes.</p><div class="field"><label for="price-csv-file">Archivo CSV</label><input id="price-csv-file" type="file" accept=".csv,text/csv"></div>';
    openModal("Carga masiva de precios", "IMPORTAR TARIFAS", body, '<button class="button" type="button" data-close>Cancelar</button><button class="button primary" type="button" id="confirm-price-import">Importar CSV</button>');
    $("#confirm-price-import").addEventListener("click", async () => {
      const file = $("#price-csv-file").files?.[0];
      if (!file) return notice("Seleccioná un archivo CSV.", true);
      try {
        const raw = await file.text();
        const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
        const sep = (lines[0] || "").includes(";") && !(lines[0] || "").includes(",") ? ";" : ","; const parse = (line) => line.split(sep).map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
        const headers = parse(lines.shift()).map(x => x.toLowerCase());
        const indexes = ["marca","modelo","servicio","precio"].map(key => headers.indexOf(key));
        if (indexes.some(i => i < 0)) throw new Error("El CSV debe incluir las columnas marca, modelo, servicio y precio.");
        const rows = lines.map(line => { const cells=parse(line); return {marca:cells[indexes[0]]||"iPhone",modelo:cells[indexes[1]]||"",servicio:cells[indexes[2]]||"",precio:Number(String(cells[indexes[3]]||"").replace(/[$. ]/g,"").replace(",", ".")),activo:true}; }).filter(x=>x.modelo&&x.servicio&&Number.isFinite(x.precio)&&x.precio>=0);
        if (!rows.length) throw new Error("No encontré filas válidas para importar."); const known = new Set(data.prices.map(p => [p.marca || "iPhone", p.modelo, p.servicio].join("|").toLowerCase())); const fresh = rows.filter(r => !known.has([r.marca, r.modelo, r.servicio].join("|").toLowerCase())); if (!fresh.length) throw new Error("Todas las tarifas del archivo ya existían; no se agregó nada.");
        if (!window.confirm("Se agregarán "+fresh.length+" tarifas nuevas"+(rows.length>fresh.length?" ("+(rows.length-fresh.length)+" repetidas se omiten)":"")+". ¿Continuar?")) return;
        const {error}=await sb.from("precios").insert(fresh);
        if(error) throw error;
        notice(fresh.length+" tarifas importadas."); closeModal(); await refresh();
      } catch(error) { notice("No se pudo importar: "+(error.message||error),true); }
    });
  }
  function renderTrash() {
    $("#trash-list").innerHTML = data.trash.map((order) => `<article class="order-row trash-row"><b class="order-no">#${order.id}</b><div class="row-main"><b>${esc(order.cliente || order.gremio || "Cliente")}</b><small>${esc(order.modelo || "")} · Eliminada ${date(order.borrada)}</small></div><div><span class="branch-pill">${esc(order.negocio)}</span></div><button class="button" data-restore="${order.id}">Restaurar</button></article>`).join("") || `<div class="empty-state">La papelera está vacía.</div>`;
  }
  function renderCurrent() {
    renderOrders(); renderClients($("#client-search").value); renderDashboard(); renderPrices($("#price-search").value); renderTrash(); renderCash(); renderStock(); renderSales(); renderClaims(); renderReports();
  }
  function setView(view) {
    data.view = view;
    $$(".view").forEach((section) => { section.hidden = section.id !== `view-${view}`; });
    $$('[data-view]').forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    const titles = { inicio: "Inicio", presupuestos: "Presupuestos", ordenes: "Órdenes de reparación", clientes: "Clientes", precios: "Precios de reparación", caja: "Caja y movimientos", stock: "Inventario y accesorios", ventas: "Ventas", garantias: "Garantías y reclamos", reportes: "Reportes del negocio", costos: "Costos pendientes", papelera: "Papelera de órdenes" };
    $("#new-order").hidden = view === "inicio";
        $("#page-title").textContent = titles[view]; $(".sidebar").classList.remove("open"); $("#sidebar-backdrop").classList.remove("visible"); $("#menu-toggle").setAttribute("aria-expanded","false"); $("#menu-toggle").setAttribute("aria-label","Abrir menú"); $("#menu-toggle").textContent="☰";
    if (view === "inicio") renderDashboard();
    if (view === "ordenes") loadOrders({ search: $("#order-search").value }).then((rows) => { data.orders = rows; renderOrders(rows); renderStats(); }).catch((error) => notice(error.message, true));
    if (["caja","stock","ventas","garantias","reportes","costos"].includes(view)) refresh().catch((error) => notice(error.message,true));
  }
  function openClientForm(client = null) {
    const body = `<div class="form-grid">${formField("Nombre completo *", "nombre", client?.nombre || "", "text", "span-2")}${formField("Teléfono", "telefono", client?.telefono || "", "tel")}${formField("Email", "email", client?.email || "", "email")}<div class="field span-2"><label for="f-notas">Notas</label><textarea id="f-notas" name="notas">${esc(client?.notas || "")}</textarea></div></div>`;
    openModal(client ? "Editar cliente" : "Nuevo cliente", "CLIENTES", body, actionButtons());
    $("#modal-form").dataset.action = "save-client"; $("#modal-form").dataset.id = client?.id || "";
  }
  function getE30Settings(){try{return JSON.parse(localStorage.getItem("e30_settings")||"{}")}catch(e){return {}}}
  function saveE30Settings(){const s={e30Name:$("#cfg-e30-name").value,i30Name:$("#cfg-i30-name").value,e30Address:$("#cfg-e30-address").value,i30Address:$("#cfg-i30-address").value,phone:$("#cfg-phone").value,warrantyDays:Number($("#cfg-warranty-days").value||30),warrantyTerms:$("#cfg-warranty-terms").value};localStorage.setItem("e30_settings",JSON.stringify(s));notice("Configuración guardada en este dispositivo.");}
  function openOrderForm(order = null) {
    const isEditing = Boolean(order?.id);
    const clientOptions = data.clients.map((client) => `<option value="${esc(client.id)}" ${String(client.id) === String(order?.cliente_id) ? "selected" : ""}>${esc(client.nombre)}${client.telefono ? ` · ${esc(client.telefono)}` : ""}</option>`).join("");
    const body = `<div class="form-grid order-form-grid">
      ${!isEditing ? selectField("Tipo de trabajo", "tipo", ["Particular", "Gremio"], "Particular") : ""}
      ${selectField("Sucursal", "negocio", Rules.BRANCHES, order?.negocio || "E30")}
      ${isEditing ? selectField("Estado", "estado", Rules.ORDER_STATES, order?.estado || "Recibido", "span-2") : ""}
      <div class="field span-2" id="client-picker-wrap"><label for="f-cliente_id">Cliente *</label>
        <select id="f-cliente_id" name="cliente_id"><option value="">Elegí un cliente existente</option>${clientOptions}</select>
        <button type="button" class="button quick-client-button" id="quick-client-toggle">＋ Alta rápida de cliente</button>
      </div>
      <div class="field span-2" id="quick-client-fields" hidden>
        <label>Nuevo cliente</label>
        ${formField("Nombre / comercio *", "nuevo_nombre")}
        ${formField("Teléfono", "nuevo_telefono", "", "tel")}
        ${formField("Email (opcional)", "nuevo_email", "", "email")}
        <p class="quick-client-hint">El cliente se guarda automáticamente al crear la orden.</p>
        <div class="quick-client-actions"><button type="button" class="button" id="quick-client-cancel">Cancelar</button></div>
      </div>
      <div class="field span-2" id="guild-name-wrap" hidden>${formField("Técnico / comercio *", "gremio", order?.gremio || "")}</div>
      ${formField("Modelo del equipo *", "modelo", order?.modelo || "")}
      ${formField("Total acordado ($)", "total", order?.total ?? "", "number", "span-2")}
      <div class="field span-2"><label for="f-falla">Falla / trabajo solicitado *</label><textarea id="f-falla" name="falla" required>${esc(order?.falla || "")}</textarea><div class="fault-quick-picks" aria-label="Fall as frecuentes">${["Pantalla","Batería","No carga","Pin de carga","Cámara","Face ID","Audio","No enciende","Se reinicia","Software","Otro"].map(x=>`<button type="button" class="fault-chip" data-fault="${x}">${x}</button>`).join("")}</div></div>
      <div class="field span-2"><label for="f-estado_ingreso">Observaciones de recepción <span class="muted">· opcional</span></label><textarea id="f-estado_ingreso" name="estado_ingreso" placeholder="Golpes, rayas o accesorios que deja...">${esc(order?.estado_ingreso || "")}</textarea></div>
      ${!isEditing ? '<div class="field span-2 reception-photo-field"><label for="f-order-photo">Foto del equipo · opcional</label><input id="f-order-photo" name="order_photo" type="file" accept="image/*" capture="environment"><small>Se comprime antes de guardarse para ocupar poco espacio.</small></div>' : ""}
      ${!isEditing ? formField("Seña inicial ($)", "sena", "0", "number", "span-2") : ""}
      <details class="order-advanced span-2">
        <summary>Datos adicionales <span>Opcionales</span></summary>
        <div class="form-grid">
          ${formField("IMEI / número de serie", "imei", order?.imei || "")}
          ${selectField("Garantía (días)", "garantia_dias", ["30", "Sin garantía", "60", "90", "180"], order?.garantia_dias == null ? "30" : String(order.garantia_dias))}
          <div class="field span-2"><label for="f-notas">Notas internas</label><textarea id="f-notas" name="notas">${esc(order?.notas || "")}</textarea></div>
        </div>
      </details>
    </div>`;
    openModal(isEditing ? `Editar orden #${order.id}` : "Nueva orden", "ORDEN DE TRABAJO", body, actionButtons("Cancelar", isEditing ? "Guardar cambios" : "Crear orden"));
    $("#modal-form").dataset.action = isEditing ? "update-order" : "create-order";
    $("#modal-form").dataset.id = isEditing ? order.id : "";
    $$(".fault-chip").forEach((button) => button.addEventListener("click", () => {
      const field=$("#f-falla"); const value=button.dataset.fault;
      const parts=field.value.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
      if(!parts.some(x=>x.toLocaleLowerCase("es-AR")===value.toLocaleLowerCase("es-AR"))) parts.push(value);
      field.value=parts.join(", "); field.focus(); button.classList.add("selected");
    }));
    const type = $("#f-tipo");
    const toggleType = () => {
      const guild = (type?.value || order?.tipo || "Particular") === "Gremio";
      $("#guild-name-wrap").hidden = !guild;
      $("#f-gremio")?.toggleAttribute("required", guild);
      $("#client-picker-wrap").hidden = guild;
      $("#quick-client-fields").hidden = true;
      $("#quick-client-toggle").hidden = false;
      $("#f-cliente_id").disabled = false;
      $("#f-nuevo_nombre").required = false;
      $("#f-cliente_id").required = !guild;
    };
    type?.addEventListener("change", toggleType);
    toggleType();
    $("#quick-client-toggle")?.addEventListener("click", () => {
      $("#quick-client-fields").hidden = false;
      $("#quick-client-toggle").hidden = true;
      $("#f-cliente_id").required = false;
      $("#f-cliente_id").disabled = true;
      $("#f-nuevo_nombre").required = true;
      $("#f-nuevo_nombre").focus();
    });
    $("#quick-client-cancel")?.addEventListener("click", () => {
      $("#quick-client-fields").hidden = true;
      $("#quick-client-toggle").hidden = false;
      $("#f-cliente_id").disabled = false;
      $("#f-cliente_id").required = !((type?.value || order?.tipo || "Particular") === "Gremio");
      $("#f-nuevo_nombre").required = false;
    });
  }
  function openPriceForm(price = null) {
    const body = `<div class="form-grid">${formField("Marca", "marca", price?.marca || "iPhone")}${formField("Modelo *", "modelo", price?.modelo || "")} ${formField("Reparación *", "servicio", price?.servicio || "")} ${formField("Precio *", "precio", price?.precio ?? "", "number")}</div>`;
    openModal(price ? "Editar tarifa" : "Agregar tarifa", "LISTA DE PRECIOS", body, actionButtons());
    $("#modal-form").dataset.action = "save-price"; $("#modal-form").dataset.id = price?.id || "";
  }
  async function openOrder(orderId) {
    let order = data.orders.find((row) => String(row.id) === String(orderId)) || data.trash.find((row) => String(row.id) === String(orderId));
    if (!order) {
      const result = await sb.from("ordenes").select("*,clientes(id,nombre,telefono)").eq("id", orderId).maybeSingle();
      if (result.error) return notice(result.error.message, true);
      order = result.data;
    }
    if (!order) return;
    data.currentOrder = order;
    const [{ data: history, error: historyError }, { data: payments, error: paymentsError }] = await Promise.all([
      sb.from("orden_historial").select("id,evento,detalle,creado").eq("orden_id", order.id).order("creado", { ascending: false }).limit(100),
      sb.from("pagos").select("id,importe,medio,creado").eq("orden_id", order.id).order("creado", { ascending: false }),
    ]);
    if (historyError || paymentsError) return notice(`No se pudo cargar el historial: ${(historyError || paymentsError).message}`, true);
    const due = Rules.balance({ ...order, pagos: payments || [] });
    let photoUrl = ""; if (order.foto_path) { const signed = await sb.storage.from("ordenes-fotos").createSignedUrl(order.foto_path, 300); photoUrl = signed.data?.signedUrl || ""; }
    const stateOptions = Rules.ORDER_STATES.map((state) => `<option value="${esc(state)}" ${state === order.estado ? "selected" : ""}>${esc(state)}</option>`).join("");
    const body = `<div class="detail-grid"><div class="detail-item"><small>Cliente</small><b>${esc(order.clientes?.nombre || order.cliente || order.gremio || "Sin nombre")}</b></div><div class="detail-item"><small>Equipo · sucursal</small><b>${esc(order.modelo)} · ${esc(order.negocio)}</b></div><div class="detail-item"><small>Estado</small><b>${esc(order.estado)}</b></div><div class="detail-item"><small>Total · saldo</small><b>${money(order.total)} · ${money(due)}</b></div><div class="detail-item"><small>Falla / trabajo</small><b>${esc(order.falla || "—")}</b></div><div class="detail-item"><small>Teléfono</small><b>${esc(order.telefono || order.clientes?.telefono || "—")}</b></div><div class="detail-item"><small>IMEI / serie</small><b>${esc(order.imei || "—")}</b></div><div class="detail-item"><small>Creada</small><b>${date(order.creada)}</b></div></div><div class="quick-actions">${due > 0 ? `<button class="button primary" data-payment="${order.id}" data-balance="${due}">＋ Registrar pago / seña</button>` : ""}<button class="button" data-edit-order="${order.id}">Editar orden</button><button class="button" data-costs="${order.id}">Cargar costos</button><button class="button" data-add-photo="${order.id}">${order.foto_path ? "Cambiar foto" : "Agregar foto opcional"}</button><button class="button" data-ticket="${order.id}" data-ticket-type="recepcion">Imprimir recepción</button><button class="button" data-ticket="${order.id}" data-ticket-type="entrega">Imprimir entrega</button>${order.borrada ? `<button class="button" data-restore="${order.id}">Restaurar</button>` : `<button class="button danger" data-trash="${order.id}">Enviar a papelera</button>`}</div><div class="field state-editor"><label for="detail-state">Cambiar estado</label><select id="detail-state">${stateOptions}</select><button class="button primary" type="button" data-update-state="${order.id}">Guardar estado</button></div>${photoUrl ? `<div class="order-photo-preview"><img src="${esc(photoUrl)}" alt="Foto del equipo recibido"><small>Foto privada de la orden</small></div>` : ""}<h3 class="section-title">Pagos registrados</h3>${(payments || []).map((payment) => `<div class="payment-row"><span>${date(payment.creado)} · ${esc(payment.medio || "Efectivo")}</span><b>${money(payment.importe)}</b></div>`).join("") || `<p class="muted">Todavía no hay pagos registrados.</p>`}<h3 class="section-title">Historial de la reparación</h3>${(history || []).map((entry) => `<div class="history-item"><b>${esc(entry.evento)}</b>${entry.detalle ? ` · ${esc(entry.detalle)}` : ""}<small>${date(entry.creado)}</small></div>`).join("") || `<p class="muted">Sin eventos de historial.</p>`}`;
    openModal(`Orden #${order.id}`, "DETALLE DE REPARACIÓN", body, `<button class="button" type="button" data-close>Cerrar</button>`);
    $("#modal-form").dataset.action = "dismiss";
  }
  async function openClient(clientId) {
    const client = data.clients.find((row) => String(row.id) === String(clientId)); if (!client) return;
    const { data: linked, error } = await sb.from("ordenes").select("id,cliente_id,cliente,modelo,estado,total,negocio,creada,borrada").eq("cliente_id", client.id).order("creada", { ascending: false }).limit(1000);
    if (error) return notice(`No se pudo cargar el historial del cliente: ${error.message}`, true);
    const orders = linked || [];
    const body = `<div class="detail-grid"><div class="detail-item"><small>Teléfono</small><b>${esc(client.telefono || "—")}</b></div><div class="detail-item"><small>Email</small><b>${esc(client.email || "—")}</b></div></div><p>${esc(client.notas || "Sin notas")}</p><h3 class="section-title">Historial de reparaciones · ${orders.length}</h3>${orders.map((order) => `<div class="history-item" data-open-order="${order.id}"><b>#${order.id} · ${esc(order.modelo || "Equipo")}</b> · ${esc(order.borrada ? "En papelera" : order.estado)} · ${money(order.total)}<small>${date(order.creada)} · ${esc(order.negocio)}</small></div>`).join("") || `<p class="muted">Este cliente todavía no tiene órdenes asociadas.</p>`}<div class="quick-actions"><button class="button" data-edit-client="${esc(client.id)}">Editar cliente</button><button class="button primary" data-client-new-order="${esc(client.id)}">＋ Crear orden</button></div>`;
    openModal(client.nombre, "CLIENTE E HISTORIAL", body, `<button class="button" type="button" data-close>Cerrar</button>`);
  }
  function openCostsForm(order) {
    const body = `<p class="muted">Completá estos datos cuando tengas un rato. No hace falta cargarlos al recibir el equipo.</p><div class="form-grid">
      ${formField("Costo del repuesto ($)", "costo_repuesto", order.costo_repuesto ?? 0, "number")}
      ${formField("Mano de obra ($)", "costo_mano_obra", order.costo_mano_obra ?? 0, "number")}
      ${formField("Otros gastos ($)", "costo_otros", order.costo_otros ?? 0, "number")}
      <p class="muted span-2">No modifica caja ni stock. Solo calcula la rentabilidad de la reparación.</p>
    </div>`;
    openModal("Completar costos", `ORDEN #${order.id} · ${esc(order.modelo || "")}`, body, actionButtons("Después", "Guardar costos"));
    $("#modal-form").dataset.action = "save-order-costs"; $("#modal-form").dataset.id = order.id;
  }
  async function storeOrderPhoto(orderId, file) {
    if (!file || !file.type.startsWith("image/")) throw new Error("Elegí una imagen válida.");
    const image = new Image(), objectUrl = URL.createObjectURL(file);
    try {
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("No se pudo leer la foto."));image.src=objectUrl;});
      const scale=Math.min(1,1280/Math.max(image.width,image.height)), canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
      let blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.68));if(!blob)throw new Error("No se pudo comprimir la foto.");
      let quality=0.58;while(blob.size>240*1024&&quality>=0.38){blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));quality-=0.08;}
      if(blob.size>256*1024)throw new Error("La foto sigue siendo pesada. Probá con otra imagen.");
      const {data:userData,error:userError}=await sb.auth.getUser();if(userError||!userData.user)throw new Error("La sesión expiró. Volvé a ingresar.");
      const path=userData.user.id+"/"+orderId+".jpg";
      const uploaded=await sb.storage.from("ordenes-fotos").upload(path,blob,{contentType:"image/jpeg",upsert:true});if(uploaded.error)throw uploaded.error;
      const saved=await sb.from("ordenes").update({foto_path:path}).eq("id",orderId);if(saved.error)throw saved.error;
    } finally { URL.revokeObjectURL(objectUrl); }
  }
  async function addOrderPhoto(orderId) {
    const input=document.createElement("input");input.type="file";input.accept="image/*";input.capture="environment";
    input.addEventListener("change",async()=>{const file=input.files?.[0];if(!file)return;try{await storeOrderPhoto(orderId,file);notice("Foto comprimida y guardada (máximo 256 KB).");await refresh();await openOrder(orderId);}catch(error){notice("No se pudo guardar la foto: "+(error.message||error),true);}},{once:true});input.click();
  }
  function openPayment(orderId, balance) {
    const body = `<div class="form-grid">${formField("Importe del pago *", "importe", balance, "number")}${selectField("Medio de pago", "medio", Rules.PAYMENT_METHODS, "Efectivo")}<p class="muted span-2">Saldo actual: ${money(balance)}. El registro queda asociado a la orden.</p></div>`;
    openModal("Registrar pago", `ORDEN #${orderId}`, body, actionButtons("Cancelar", "Registrar pago"));
    $("#modal-form").dataset.action = "save-payment"; $("#modal-form").dataset.id = orderId;
  }
  async function runAction(event) {
    const form = event.currentTarget; const action = form.dataset.action; if (action === "dismiss") return;
    event.preventDefault(); if (data.busy) return; data.busy = true;
    const fd = new FormData(form); const values = Object.fromEntries(fd.entries());
    try {
      if (action === "save-client") {
        const payload = Rules.validateClient(values);
        const query = form.dataset.id ? sb.from("clientes").update(payload).eq("id", form.dataset.id) : sb.from("clientes").insert(payload);
        const { error } = await query; if (error) throw error;
        notice("Cliente guardado.");
      } else if (action === "create-order" || action === "update-order") {
        let client = data.clients.find((row) => row.id === values.cliente_id);
        const tipo = action === "create-order" ? (values.tipo || "Particular") : (data.currentOrder?.tipo || "Particular");
        if (tipo === "Particular" && !client && values.nuevo_nombre?.trim()) {
          const quickPayload = Rules.validateClient({ nombre: values.nuevo_nombre, telefono: values.nuevo_telefono, email: values.nuevo_email });
          const created = await sb.from("clientes").insert(quickPayload).select("id,nombre,telefono").single();
          if (created.error) throw created.error;
          client = created.data;
           data.clients.push(created.data);
        }
        if (tipo === "Particular" && !client) throw new Error("Elegí un cliente o crealo desde esta misma pantalla.");
        if (tipo === "Gremio" && !values.gremio?.trim()) throw new Error("Ingresá el nombre del técnico o comercio.");
        
        const valid = Rules.validateOrder({ ...values, sena: action === "create-order" ? values.sena : 0 });
        const payload = { cliente_id: tipo === "Particular" ? client.id : null, cliente: tipo === "Particular" ? client.nombre : values.gremio.trim(), telefono: tipo === "Particular" ? client.telefono : values.nuevo_telefono || null, negocio: valid.negocio, tipo, gremio: tipo === "Gremio" ? values.gremio.trim() : null, marca: "Apple", modelo: valid.modelo, falla: valid.falla, estado: values.estado || "Recibido", total: valid.total, notas: values.notas || null, estado_ingreso: values.estado_ingreso?.trim() || null, imei: values.imei || null, garantia_dias: values.garantia_dias === "Sin garantía" ? 0 : Number(values.garantia_dias || 30), garantia_condiciones: getE30Settings().warrantyTerms || "La garantía cubre el trabajo realizado y el repuesto instalado. No cubre golpes, humedad ni manipulación de terceros.", trabajo_realizado: values.trabajo_realizado || null };
        if (action === "create-order") {
          const result = await sb.rpc("e30_crear_orden", { p_orden: payload, p_sena: valid.sena, p_medio: "Efectivo" });
          if (result.error) throw result.error;
          data.lastCreatedOrderId = result.data;
           const receptionPhoto = $("#f-order-photo")?.files?.[0];
           if (receptionPhoto) { try { await storeOrderPhoto(data.lastCreatedOrderId, receptionPhoto); } catch (photoError) { notice("La orden se creó, pero no se pudo guardar la foto: " + (photoError.message || photoError), true); } }
        } else {
          const existing = await sb.from("ordenes").select("pagos(importe)").eq("id", form.dataset.id).single();
          if (existing.error) throw existing.error;
          const paidAmount = (existing.data.pagos || []).reduce((sum, payment) => sum + Number(payment.importe || 0), 0);
          if (valid.total < paidAmount) throw new Error(`El total no puede quedar debajo de lo ya pagado (${money(paidAmount)}).`);
          payload.entregada = payload.estado === "Entregado" ? (data.currentOrder?.entregada || new Date().toISOString()) : null;
          const result = await sb.from("ordenes").update(payload).eq("id", form.dataset.id);
          if (result.error) throw result.error;
        }
        notice(action === "create-order" ? `Orden #${data.lastCreatedOrderId} creada.` : "Orden actualizada.");
      } else if (action === "save-order-costs") {
        const fields=["costo_repuesto","costo_mano_obra","costo_otros"];const costs={};
        for(const key of fields){const n=Number(values[key]||0);if(!Number.isFinite(n)||n<0)throw new Error("Los costos deben ser números iguales o mayores a cero.");costs[key]=n;}
        costs.costo=costs.costo_repuesto+costs.costo_mano_obra+costs.costo_otros;costs.costos_cargados=true;
        const {error}=await sb.from("ordenes").update(costs).eq("id",form.dataset.id);if(error)throw error;notice("Costos guardados.");
      } else if (action === "save-price") {
        const existingPrice = data.prices.find((row) => String(row.id) === String(form.dataset.id));
        const price = { marca: values.marca || "iPhone", modelo: values.modelo.trim(), servicio: values.servicio.trim(), precio: Number(values.precio), activo: existingPrice ? existingPrice.activo : true };
        if (!price.modelo || !price.servicio || !Number.isFinite(price.precio) || price.precio < 0) throw new Error("Completá modelo, reparación y un precio válido.");
        const query = form.dataset.id ? sb.from("precios").update(price).eq("id", form.dataset.id) : sb.from("precios").insert(price);
        const { error } = await query; if (error) throw error; notice("Precio guardado.");
      } else if(action==="save-claim"){
        const orderId=Number(values.orden_id.split(" · ")[0]);if(!orderId||!values.motivo?.trim())throw new Error("Elegí una orden y describí el motivo.");const payload={orden_id:orderId,motivo:values.motivo.trim(),estado:values.estado,diagnostico:values.diagnostico||null,resolucion:values.resolucion||null,actualizado:new Date().toISOString()};const q=form.dataset.id?sb.from("reclamos_garantia").update(payload).eq("id",form.dataset.id):sb.from("reclamos_garantia").insert(payload);const {error}=await q;if(error)throw error;notice("Reclamo guardado.");
      } else if(action==="save-cash"){
        const amount=Number(values.importe);if(!values.concepto?.trim()||!Number.isFinite(amount)||amount<=0)throw new Error("Completá concepto e importe válido.");
        const {error}=await sb.from("caja_movimientos").insert({tipo:values.tipo,categoria:values.categoria||"General",concepto:values.concepto.trim(),importe:amount,medio:values.medio,sucursal:values.sucursal});if(error)throw error;notice("Movimiento de caja registrado.");
      } else if(action==="save-stock"){
        const payload={nombre:values.nombre.trim(),categoria:values.categoria||"Accesorios",sku:values.sku||null,cantidad:Number(values.cantidad),costo:Number(values.costo),precio:Number(values.precio),minimo:Number(values.minimo)};if(!payload.nombre||Object.values(payload).some(v=>typeof v==="number"&&(!Number.isFinite(v)||v<0)))throw new Error("Revisá nombre, cantidades y precios.");
        if(form.dataset.id){delete payload.cantidad;const {error}=await sb.from("stock_items").update(payload).eq("id",form.dataset.id);if(error)throw error;}else{const {data:item,error}=await sb.from("stock_items").insert(payload).select("id,cantidad,costo").single();if(error)throw error;if(Number(item.cantidad)>0){const {error:moveError}=await sb.from("stock_movimientos").insert({item_id:item.id,tipo:"Entrada",cantidad:item.cantidad,costo_unitario:item.costo,nota:"Stock inicial"});if(moveError)throw moveError;}}notice("Artículo guardado.");
      } else if(action==="stock-move"){
        const {error}=await sb.rpc("e30_stock_movimiento",{p_item_id:Number(form.dataset.id),p_tipo:values.tipo,p_cantidad:Number(values.cantidad),p_costo:Number(values.costo||0),p_nota:values.nota||null});if(error)throw error;notice("Stock actualizado.");
      } else if(action==="save-sale"){
        const itemId=Number(values.item_id.split(" · ")[0]);const amount=Number(values.cantidad);const price=Number(values.precio_unitario);if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(price)||price<0)throw new Error("Revisá cantidad y precio.");
        const {data:id,error}=await sb.rpc("e30_registrar_venta",{p_venta:{sucursal:values.sucursal,cliente:values.cliente,medio:values.medio,precio_unitario:price},p_item_id:itemId,p_cantidad:amount});if(error)throw error;notice("Venta #"+id+" registrada; stock y caja actualizados.");
      } else if (action === "save-payment") {
        const order = data.orders.find((row) => String(row.id) === String(form.dataset.id));
        if (!order) throw new Error("No se encontró la orden.");
        const { data: payments, error: paymentReadError } = await sb.from("pagos").select("importe").eq("orden_id", order.id);
        if (paymentReadError) throw paymentReadError;
        const currentBalance = Math.max(0, Number(order.total) - (payments || []).reduce((sum, item) => sum + Number(item.importe || 0), 0));
        const payment = Rules.validatePayment(values, currentBalance);
        const { error } = await sb.rpc("e30_registrar_pago", { p_orden_id: order.id, p_importe: payment.importe, p_medio: payment.medio }); if (error) throw error;
        notice("Pago registrado.");
      }
      closeModal(); await refresh();
      if (action === "create-order") {
        if (data.lastCreatedOrderId) printTicket(data.lastCreatedOrderId);
      }
    } catch (error) { notice(error.message || "No se pudo guardar el cambio.", true); }
    finally { data.busy = false; }
  }
  async function updateOrderState(orderId, selectedState = null) {
    const state = selectedState || $("#detail-state")?.value;
    if (!Rules.ORDER_STATES.includes(state)) return notice("Elegí un estado válido.", true);
    const order = data.orders.find((row) => String(row.id) === String(orderId)) || data.currentOrder;
    const patch = { estado: state, entregada: state === "Entregado" ? (order?.entregada || new Date().toISOString()) : null };
    const { error } = await sb.from("ordenes").update(patch).eq("id", orderId);
    if (error) return notice(`No se pudo actualizar el estado: ${error.message}`, true);
    closeModal(); await refresh(); notice(`Estado de la orden #${orderId}: ${state}.`);
  }

  function openQuickStatePicker(orderId) {
    const order = data.orders.find((row) => String(row.id) === String(orderId));
    if (!order) return;
    const options = Rules.ORDER_STATES.map((state) => `<option value="${esc(state)}" ${state === order.estado ? "selected" : ""}>${esc(state)}</option>`).join("");
    const body = `<p class="muted">Elegí el nuevo estado para <b>${esc(order.modelo || "el equipo")}</b>.</p><div class="field"><label for="quick-detail-state">Estado de reparación</label><select id="quick-detail-state">${options}</select></div>`;
    openModal(`Estado · Orden #${order.id}`, "ACTUALIZACIÓN RÁPIDA", body, '<button class="button" type="button" data-close>Cancelar</button><button class="button primary" type="button" id="quick-state-save">Guardar estado</button>');
    $("#quick-state-save").addEventListener("click", () => updateOrderState(orderId, $("#quick-detail-state").value));
  }

  async function trashOrder(orderId) {
    if (!confirm(`¿Enviar la orden #${orderId} a la papelera? Se puede restaurar después.`)) return;
    const { error } = await sb.from("ordenes").update({ borrada: new Date().toISOString() }).eq("id", orderId);
    if (error) return notice(`No se pudo mover a papelera: ${error.message}`, true);
    closeModal(); await refresh(); notice("Orden enviada a la papelera.");
  }
  async function restoreOrder(orderId) {
    const { error } = await sb.from("ordenes").update({ borrada: null }).eq("id", orderId);
    if (error) return notice(`No se pudo restaurar: ${error.message}`, true);
    closeModal(); await refresh(); notice("Orden restaurada.");
  }
  async function togglePrice(priceId, active) {
    const { error } = await sb.from("precios").update({ activo: !active }).eq("id", priceId);
    if (error) return notice(error.message, true); await refresh(); notice(active ? "Tarifa pausada." : "Tarifa activada.");
  }
  async function printTicket(orderId, type = "recepcion") {
    let order = data.orders.find((row) => String(row.id) === String(orderId)) || data.trash.find((row) => String(row.id) === String(orderId));
    if (!order) {
      const result = await sb.from("ordenes").select("*,pagos(id,importe,medio,creado),clientes(id,nombre,telefono)").eq("id", orderId).maybeSingle();
      if (result.error) return notice(result.error.message, true);
      order = result.data;
    }
    if (!order) return;
    const { data: payments, error } = await sb.from("pagos").select("id,importe,medio,creado").eq("orden_id", order.id).order("creado");
    if (error) return notice(error.message, true);
    const client = order.clientes?.nombre || order.cliente || order.gremio || "—";
    const paid = (payments || []).reduce((sum, p) => sum + Number(p.importe || 0), 0);
    const due = Math.max(0, Number(order.total || 0) - paid);
    const settings=getE30Settings(); const brand = order.negocio === "i30" ? (settings.i30Name||"i30 | iPhone Service") : (settings.e30Name||"E30 | Técnico de celulares");
    const warrantyDays = order.garantia_dias == null ? 30 : Number(order.garantia_dias);
    const warrantyEnd = order.entregada && warrantyDays > 0
      ? new Date(new Date(order.entregada).getTime() + warrantyDays * 86400000).toLocaleDateString("es-AR") : "No corresponde / pendiente";
    const isDelivery = type === "entrega";
    const paymentLines = (payments || []).map(p => `<div>${date(p.creado)} · ${esc(p.medio)}: ${money(p.importe)}</div>`).join("");
    const terms = warrantyDays === 0 ? "Trabajo sin garantía." : `Garantía: ${warrantyDays} días.`;
    const trackingUrl = order.tracking_token ? `${location.origin}${location.pathname.replace(/gestion-v2\.html$/, "seguimiento.html")}?t=${encodeURIComponent(order.tracking_token)}` : "";
    $("#print-area").innerHTML = `<div class="ticket">
      <h2>${brand}</h2><p>${(order.negocio === "i30" ? settings.i30Address : settings.e30Address) || (order.negocio === "i30" ? "Moreno" : "Las Flores")}</p><hr>
      <h3>${isDelivery ? "COMPROBANTE DE ENTREGA" : "COMPROBANTE DE RECEPCIÓN"}</h3>
      <b>ORDEN #${esc(order.id)}</b><p>${date(isDelivery ? (order.entregada || new Date().toISOString()) : order.creada)}</p><hr>
      ${trackingUrl ? `<div class="ticket-tracking"><div id="tracking-qr"></div><b>Seguimiento de reparación</b><small>Escaneá el QR para consultar el estado</small></div><hr>` : ""}
      <b>CLIENTE</b><p>${esc(client)}<br>${esc(order.telefono || order.clientes?.telefono || "—")}</p>
      <b>EQUIPO</b><p>${esc(order.marca || "")} ${esc(order.modelo || "")}<br>IMEI: ${esc(order.imei || "—")}</p>
      ${!isDelivery ? `<b>ESTADO DE INGRESO</b><p>${esc(order.estado_ingreso||"No informado")}</p>` : ""}<b>${isDelivery ? "TRABAJO REALIZADO" : "FALLA INFORMADA"}</b><p>${esc(isDelivery ? (order.trabajo_realizado || order.falla || "—") : (order.falla || "—"))}</p>
      <hr><b>RESUMEN DE CUENTA</b><p>Total: ${money(order.total)}<br>Pagado: ${money(paid)}<br><b>Saldo: ${money(due)}</b></p>
      ${isDelivery ? `<b>PAGOS</b><p>${paymentLines || "Sin pagos registrados"}</p>` : ""}
      <hr><b>GARANTÍA Y CONDICIONES</b><p>${terms}<br>${esc(order.garantia_condiciones || "Conserve este comprobante para cualquier consulta.")}${isDelivery && order.garantia_dias > 0 ? `<br>Vencimiento estimado: ${warrantyEnd}` : ""}</p>
      <hr><p>Declaro recibir / entregar el equipo y acepto las condiciones informadas.</p>
      <p style="margin-top:28px">Firma: ______________________</p><p>Aclaración: __________________</p><hr><p>Gracias por confiar en ${esc(order.negocio)}.</p>
    </div>`;
    if (trackingUrl && window.QRCode) {
      new QRCode($("#tracking-qr"), { text: trackingUrl, width: 112, height: 112, correctLevel: QRCode.CorrectLevel.M });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    window.print();
  }
  function monthStart(){const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);}
  function renderCash(){if(!$("#cash-list"))return;const start=monthStart();const month=data.cash.filter(x=>new Date(x.creado)>=start);const income=month.filter(x=>x.tipo==="Ingreso").reduce((a,x)=>a+Number(x.importe),0);const expense=month.filter(x=>x.tipo==="Egreso").reduce((a,x)=>a+Number(x.importe),0);$("#cash-income").textContent=money(income);$("#cash-expense").textContent=money(expense);$("#cash-net").textContent=money(income-expense);const branch=$("#cash-branch")?.value||"";const rows=data.cash.filter(x=>!branch||x.sucursal===branch);$("#cash-list").innerHTML=rows.map(x=>"<article class=\"order-row cash-row\"><div class=\"row-main\"><b>"+esc(x.concepto)+"</b><small>"+date(x.creado)+" · "+esc(x.categoria)+" · "+esc(x.medio)+"</small></div><span class=\"branch-pill\">"+esc(x.sucursal)+"</span><b class=\"money\" style=\"color:"+(x.tipo==="Ingreso"?"#16805d":"#b42318")+"\">"+(x.tipo==="Ingreso"?"+":"−")+money(x.importe)+"</b></article>").join("")||"<div class=\"empty-state\">Todavía no hay movimientos de caja.</div>";}
  function renderStock(search=""){
    if(!$("#stock-list"))return;
    const q=search.toLocaleLowerCase("es-AR").trim();
    const rows=data.stockItems.filter(x=>x.activo&&[x.nombre,x.categoria,x.sku].join(" ").toLocaleLowerCase("es-AR").includes(q));
    $("#stock-count").textContent=data.stockItems.filter(x=>x.activo).length;
    $("#stock-units").textContent=rows.reduce((a,x)=>a+Number(x.cantidad),0);
    $("#stock-low").textContent=data.stockItems.filter(x=>x.activo&&Number(x.cantidad)<=Number(x.minimo)).length;
    $("#stock-list").innerHTML=rows.map(x=>`<article class="order-row stock-row">
      <div class="row-main stock-product"><b>${esc(x.nombre)}</b><small>${esc(x.categoria)} · SKU ${esc(x.sku||"—")}</small></div>
      <div class="row-main stock-quantity"><b>${Number(x.cantidad)} unidades</b><small>Mínimo ${Number(x.minimo)}</small></div>
      <div class="row-main stock-prices"><b>Venta ${money(x.precio)}</b><small>Costo ${money(x.costo)}</small></div>
      <div class="price-actions stock-actions"><button class="button" data-stock-move="${x.id}">Movimiento</button><button class="button" data-stock-edit="${x.id}">Editar</button></div>
      ${Number(x.cantidad)<=Number(x.minimo)?'<span class="state-pill pending stock-low-pill">Stock bajo</span>':""}
    </article>`).join("")||'<div class="empty-state">No hay artículos cargados. Agregá el primero para empezar.</div>';
  }
  function renderSales(){if(!$("#sales-list"))return;const start=monthStart();const rows=data.sales.filter(x=>new Date(x.creado)>=start);$("#sales-total").textContent=money(rows.reduce((a,x)=>a+Number(x.total),0));$("#sales-units").textContent=rows.reduce((a,x)=>a+(x.venta_items||[]).reduce((n,i)=>n+Number(i.cantidad),0),0);$("#sales-margin").textContent=money(rows.reduce((a,x)=>a+Number(x.total)-Number(x.costo_total),0));$("#sales-list").innerHTML=data.sales.map(x=>"<article class=\"order-row sales-row\"><div class=\"row-main\"><b>Venta #"+x.id+" · "+esc(x.concepto||"Venta")+"</b><small>"+date(x.creado)+" · "+esc(x.cliente||"Consumidor final")+" · "+esc(x.medio)+"</small></div><span class=\"branch-pill\">"+esc(x.sucursal)+"</span><b class=\"money\">"+money(x.total)+"</b></article>").join("")||"<div class=\"empty-state\">Todavía no hay ventas.</div>";}
  function openCashForm(){const body="<div class=\"form-grid\">"+selectField("Tipo","tipo",["Egreso","Ingreso"],"Egreso")+selectField("Sucursal","sucursal",Rules.BRANCHES,"E30")+formField("Categoría","categoria","Gastos del local")+selectField("Medio","medio",Rules.PAYMENT_METHODS,"Efectivo")+formField("Concepto *","concepto")+formField("Importe *","importe","","number")+"</div>";openModal("Registrar movimiento","CAJA",body,actionButtons("Cancelar","Guardar movimiento"));$("#modal-form").dataset.action="save-cash";}
  function openStockForm(item=null){const body="<div class=\"form-grid\">"+formField("Nombre *","nombre",item?.nombre||"")+formField("Categoría","categoria",item?.categoria||"Accesorios")+formField("SKU / código de barras","sku",item?.sku||"")+formField("Cantidad inicial","cantidad",item?.cantidad??0,"number")+formField("Costo unitario","costo",item?.costo??0,"number")+formField("Precio de venta","precio",item?.precio??0,"number")+formField("Stock mínimo","minimo",item?.minimo??0,"number")+"</div>";openModal(item?"Editar artículo":"Nuevo artículo","INVENTARIO",body,actionButtons());$("#modal-form").dataset.action="save-stock";$("#modal-form").dataset.id=item?.id||"";const sku=$("#f-sku");const scan=document.createElement("button");scan.type="button";scan.className="button";scan.textContent="Escanear código de barras";scan.addEventListener("click",startStockBarcodeScanner);sku.parentElement.appendChild(scan);}
  async function startStockBarcodeScanner(){
    let scanner=null;let closed=false;
    const wrap=document.createElement("dialog");wrap.style.cssText="position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;padding:20px;background:rgba(0,0,0,.96);color:white;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:2147483647";
    wrap.innerHTML='<h3>Escanear código de barras</h3><div id="e30-barcode-reader" style="width:min(92vw,560px);background:#111;border-radius:12px;overflow:hidden"></div><p>Apuntá la cámara al código de barras</p><button type="button" class="button">Cancelar</button>';document.body.appendChild(wrap);
    const close=async()=>{if(closed)return;closed=true;try{if(scanner)await scanner.stop();}catch(e){}try{if(scanner)await scanner.clear();}catch(e){}try{wrap.close();}catch(e){}wrap.remove();};
    wrap.querySelector("button").addEventListener("click",close);
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("La cámara no está disponible. Abrí Gestión desde Safari con conexión segura.");
      if(!window.Html5Qrcode){
        await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";script.onload=resolve;script.onerror=()=>reject(new Error("No se pudo cargar el lector de códigos. Revisá la conexión."));document.head.appendChild(script);});
      }
      if(closed)return;
      wrap.showModal();
      scanner=new Html5Qrcode("e30-barcode-reader");
      const formatsToSupport=[Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E,Html5QrcodeSupportedFormats.CODE_128,Html5QrcodeSupportedFormats.CODE_39,Html5QrcodeSupportedFormats.ITF];
      await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:Math.min(300,Math.floor(window.innerWidth*.72)),height:130},formatsToSupport},async(decodedText)=>{const field=document.querySelector("#f-sku");if(field)field.value=decodedText;notice("Código leído: "+decodedText);await close();},()=>{});
    }catch(e){await close();notice(e.message||"No se pudo iniciar la cámara. Revisá los permisos del navegador.",true);}
  }
  function openStockMove(itemId){const item=data.stockItems.find(x=>String(x.id)===String(itemId));if(!item)return;const body="<p class=\"muted\">"+esc(item.nombre)+" · Stock actual: "+item.cantidad+"</p><div class=\"form-grid\">"+selectField("Movimiento","tipo",["Entrada","Salida","Ajuste"],"Entrada")+formField("Cantidad *","cantidad","1","number")+formField("Costo unitario","costo",item.costo,"number")+"<div class=\"field span-2\"><label for=\"f-nota\">Nota</label><input id=\"f-nota\" name=\"nota\"></div></div>";openModal("Movimiento de stock","ARTÍCULO #"+item.id,body,actionButtons());$("#modal-form").dataset.action="stock-move";$("#modal-form").dataset.id=item.id;}
  function openSaleForm(){const active=data.stockItems.filter(x=>x.activo&&Number(x.cantidad)>0);if(!active.length)return notice("Primero cargá artículos con stock disponible.",true);const opts=active.map(x=>x.id+" · "+x.nombre+" · "+x.cantidad+" disponibles");const body="<div class=\"form-grid\">"+selectField("Artículo *","item_id",opts,opts[0],"span-2")+formField("Cantidad *","cantidad","1","number")+formField("Precio unitario","precio_unitario",active[0].precio,"number")+formField("Cliente (opcional)","cliente")+selectField("Sucursal","sucursal",Rules.BRANCHES,"E30")+selectField("Medio de pago","medio",Rules.PAYMENT_METHODS,"Efectivo")+"</div><p class=\"muted\">Al confirmar se descuenta el stock y se registra el ingreso en caja.</p>";openModal("Nueva venta","VENTAS",body,actionButtons("Cancelar","Registrar venta"));$("#modal-form").dataset.action="save-sale";$("#f-item_id").addEventListener("change",()=>{const id=$("#f-item_id").value.split(" · ")[0];const item=active.find(x=>String(x.id)===id);if(item)$("#f-precio_unitario").value=item.precio;});}
  function renderClaims(){if(!$("#claims-list"))return;$("#claims-list").innerHTML=data.claims.map(x=>"<article class=\"order-row\"><div class=\"row-main\"><b>Reclamo #"+x.id+" · Orden #"+x.orden_id+"</b><small>"+esc(x.ordenes?.modelo||"Equipo")+" · "+esc(x.ordenes?.cliente||x.ordenes?.gremio||"Cliente")+" · "+date(x.creado)+"</small></div><span class=\"state-pill pending\">"+esc(x.estado)+"</span><div class=\"price-actions\"><button class=\"button\" data-claim-edit=\""+x.id+"\">Abrir</button></div></article>").join("")||"<div class=\"empty-state\">No hay reclamos cargados.</div>";}
  function renderReports() {
    if (!$("#branch-report")) return;
    const start = monthStart();
    const orders = data.orders.filter((x) => new Date(x.creada) >= start);
    const paidOrders = data.orders.flatMap((order) => (order.pagos || []).filter((p) => new Date(p.creado) >= start).map((p) => ({ ...p, negocio: order.negocio })));
    const sales = data.sales.filter((x) => new Date(x.creado) >= start);
    const collected = paidOrders.reduce((sum, row) => sum + Number(row.importe || 0), 0);
    const cost = orders.reduce((sum, row) => sum + Number(row.costo || 0), 0);
    $("#report-revenue").textContent = money(collected);
    $("#report-cost").textContent = money(cost);
    $("#report-profit").textContent = money(data.orders.filter(x=>x.costos_cargados).reduce((sum,x)=>sum+Number(x.total||0)-Number(x.costo||0),0));
    $("#report-sales").textContent = money(sales.reduce((sum, row) => sum + Number(row.total || 0), 0));
    $("#pending-costs-list").innerHTML = data.orders.filter(x=>x.estado==="Entregado"&&!x.costos_cargados).sort((a,b)=>new Date(b.entregada||b.creada)-new Date(a.entregada||a.creada)).map(x=>`<article class="order-row"><div class="row-main"><b>Orden #${x.id} · ${esc(x.modelo||"Equipo")}</b><small>${esc(x.cliente||x.gremio||"Cliente")} · ${esc(x.negocio)} · Entregada ${date(x.entregada)}</small></div><span class="state-pill pending">Costos pendientes</span><button class="button" data-costs="${x.id}">Completar costos</button></article>`).join("") || `<div class="empty-state">No hay costos pendientes de completar.</div>`;
    $("#branch-report").innerHTML = Rules.BRANCHES.map((branch) => {
      const branchOrders = orders.filter((x) => x.negocio === branch);
      const branchPayments = paidOrders.filter((x) => x.negocio === branch);
      const branchSales = sales.filter((x) => x.sucursal === branch);
      const paid = branchPayments.reduce((sum, row) => sum + Number(row.importe || 0), 0);
      const sold = branchSales.reduce((sum, row) => sum + Number(row.total || 0), 0);
      const costs = branchOrders.reduce((sum, row) => sum + Number(row.costo || 0), 0);
      return `<article class="order-row report-row"><div class="row-main"><b>${branch}</b><small>${branchOrders.length} órdenes · ${branchSales.length} ventas</small></div><div class="row-main"><small>Cobros de órdenes</small><b>${money(paid)}</b></div><div class="row-main"><small>Ventas accesorios</small><b>${money(sold)}</b></div><div class="row-main"><small>Costos de órdenes creadas</small><b>${money(costs)}</b></div></article>`;
    }).join("");
  }
  function openClaimForm(claim=null){const orderOpts=data.orders.filter(x=>x.estado==="Entregado"||Number(x.garantia_dias)>0).map(x=>String(x.id)+" · "+x.modelo+" · "+(x.cliente||x.gremio||"Cliente"));const body="<div class=\"form-grid\">"+selectField("Orden *","orden_id",orderOpts,claim?String(claim.orden_id)+" · "+(claim.ordenes?.modelo||""):"") +formField("Motivo del reclamo *","motivo",claim?.motivo||"","text","span-2")+selectField("Estado","estado",["Abierto","En revisión","Aprobado","Rechazado","Resuelto"],claim?.estado||"Abierto")+formField("Diagnóstico","diagnostico",claim?.diagnostico||"","text","span-2")+formField("Resolución","resolucion",claim?.resolucion||"","text","span-2")+"</div>";openModal(claim?"Reclamo #"+claim.id:"Nuevo reclamo","GARANTÍA",body,actionButtons());$("#modal-form").dataset.action="save-claim";$("#modal-form").dataset.id=claim?.id||"";}
  function bindEvents() {
    $$("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault(); $("#login-error").textContent = "";
      const { error } = await sb.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-password").value });
      if (error) $("#login-error").textContent = `No se pudo iniciar sesión: ${error.message}`;
    });
    $("#signup-button").addEventListener("click", async () => {
      const email = $("#login-email").value.trim();
      const password = $("#login-password").value;
      $("#login-error").textContent = "";
      if (!email) { $("#login-error").textContent = "Ingresá tu email."; return; }
      if (password.length < 8) { $("#login-error").textContent = "Usá una contraseña de al menos 8 caracteres."; return; }
      const button = $("#signup-button"); button.disabled = true; button.textContent = "Creando cuenta…";
      try {
        const { data: result, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (result.session) notice("Cuenta creada. Ya podés empezar a cargar tus datos.");
        else $("#login-error").textContent = "Cuenta creada. Revisá tu email para confirmar el acceso y después iniciá sesión.";
      } catch (error) {
        $("#login-error").textContent = `No se pudo crear la cuenta: ${error.message || error}`;
      } finally { button.disabled = false; button.textContent = "Crear cuenta de prueba"; }
    });
    $("#sign-out").addEventListener("click", async () => { await sb.auth.signOut(); });
    $("#new-order").addEventListener("click", () => openOrderForm());
    $("#home-new-order").addEventListener("click", () => openOrderForm());
    $("#home-prices").addEventListener("click", () => setView("precios"));
    $("#home-view-orders").addEventListener("click", () => setView("ordenes"));
    $("#budget-add").addEventListener("click", () => notice("El formulario de presupuestos se incorpora en la siguiente etapa."));
    $("#new-client").addEventListener("click", () => openClientForm());
    $("#new-price").addEventListener("click", () => openPriceForm());
    $("#cash-add").addEventListener("click",openCashForm);$("#cash-branch").addEventListener("change",renderCash);
    $("#stock-add").addEventListener("click",()=>openStockForm());$("#stock-search").addEventListener("input",e=>renderStock(e.target.value));
    $("#sale-add").addEventListener("click",openSaleForm);$("#claim-add").addEventListener("click",()=>openClaimForm());
    const sidebar = $(".sidebar");
    const backdrop = $("#sidebar-backdrop");
    const toggleSidebar = (force) => {
      const open = typeof force === "boolean" ? force : !sidebar.classList.contains("open");
      sidebar.classList.toggle("open", open);
      backdrop.classList.toggle("visible", open);
      $("#menu-toggle").setAttribute("aria-expanded", String(open));
      $("#menu-toggle").setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      $("#menu-toggle").textContent = open ? "×" : "☰";
    };
    $("#menu-toggle").addEventListener("click", () => toggleSidebar());
    $("#mobile-new-order").addEventListener("click", () => openOrderForm());
    // El acceso «Más» ya no forma parte de la barra móvil.
    backdrop.addEventListener("click", () => toggleSidebar(false));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") toggleSidebar(false); });
    $("#modal-form").addEventListener("submit", runAction); $("#cfg-save").addEventListener("click",saveE30Settings); $("#theme-toggle").addEventListener("click",()=>{const dark=document.body.classList.toggle("theme-dark");localStorage.setItem("e30_theme",dark?"dark":"light");$("#theme-toggle").textContent=dark?"☀ Activar modo claro":"☾ Activar modo noche";});
    $("#modal").addEventListener("click", (event) => { if (event.target === $("#modal") || event.target.closest("[data-close]")) closeModal(); });
    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-quick-state],[data-more-prices],[data-stock-move],[data-stock-edit],[data-claim-edit],[data-empty-add-price],[data-empty-bulk-price],[data-order],[data-client],[data-edit-client],[data-client-new-order],[data-edit-order],[data-open-order],[data-payment],[data-trash],[data-restore],[data-ticket],[data-edit-price],[data-toggle-price],[data-copy-price],[data-update-state],[data-costs],[data-add-photo]");
      if (!target) return;
      if (target.dataset.quickState) openQuickStatePicker(target.dataset.quickState);
      else if (target.dataset.morePrices) { renderPrices.limit = (renderPrices.limit || 80) + 80; renderPrices($("#price-search").value); }
      else if (target.dataset.emptyAddPrice) openPriceForm();
      else if (target.dataset.emptyBulkPrice) openBulkPriceImport();
      else if (target.dataset.order) openOrder(target.dataset.order);
      else if (target.dataset.client) openClient(target.dataset.client);
      else if (target.dataset.editClient) openClientForm(data.clients.find((row) => String(row.id) === target.dataset.editClient));
      else if (target.dataset.clientNewOrder) { const client = data.clients.find((row) => row.id === target.dataset.clientNewOrder); closeModal(); openOrderForm({ cliente_id: client?.id }); }
      else if (target.dataset.editOrder) openOrderForm(data.currentOrder || data.orders.find((row) => String(row.id) === target.dataset.editOrder));
      else if (target.dataset.openOrder) openOrder(target.dataset.openOrder);
      else if (target.dataset.payment) openPayment(target.dataset.payment, Number(target.dataset.balance));
      else if (target.dataset.trash) trashOrder(target.dataset.trash);
      else if (target.dataset.restore) restoreOrder(target.dataset.restore);
      else if (target.dataset.ticket) printTicket(target.dataset.ticket, target.dataset.ticketType || "recepcion");
      else if (target.dataset.updateState) updateOrderState(target.dataset.updateState);
      else if (target.dataset.costs) { const order=data.orders.find(x=>String(x.id)===target.dataset.costs)||data.currentOrder; if(order)openCostsForm(order); }
      else if (target.dataset.addPhoto) addOrderPhoto(target.dataset.addPhoto);
      else if (target.dataset.editPrice) openPriceForm(data.prices.find((row) => String(row.id) === target.dataset.editPrice));
      else if (target.dataset.copyPrice) { const price=data.prices.find((row)=>String(row.id)===target.dataset.copyPrice); if(price){const value=`${price.marca||""} ${price.modelo} · ${price.servicio}: ${money(price.precio)}`.trim(); if(navigator.clipboard?.writeText){navigator.clipboard.writeText(value).then(()=>notice("Precio copiado."),()=>notice("No se pudo copiar el precio.",true));}else{notice("Tu navegador no permite copiar desde esta página.",true);}} }
      else if (target.dataset.togglePrice) togglePrice(target.dataset.togglePrice, target.dataset.active === "true");
      else if(target.dataset.stockMove)openStockMove(target.dataset.stockMove);
      else if(target.dataset.stockEdit)openStockForm(data.stockItems.find(x=>String(x.id)===target.dataset.stockEdit));
      else if(target.dataset.claimEdit)openClaimForm(data.claims.find(x=>String(x.id)===target.dataset.claimEdit));
    });
    const queryOrders = () => { clearTimeout(data.queryTimer); data.queryTimer = setTimeout(async () => { try { const rows = await loadOrders({ search: $("#order-search").value }); data.orders = rows; renderOrders(rows); renderStats(); } catch (error) { notice(error.message, true); } }, 250); };
    $("#order-search").addEventListener("input", queryOrders); $("#branch-filter").addEventListener("change", () => renderOrders());
    $("#state-filter").addEventListener("change", () => renderOrders());
    $("#client-search").addEventListener("input", (event) => renderClients(event.target.value));
    $("#price-search").addEventListener("focus", () => document.body.classList.add("price-searching"));
    $("#price-search").addEventListener("blur", () => document.body.classList.remove("price-searching"));
    $("#price-search").addEventListener("input", (event) => { renderPrices.limit = 80; renderPrices(event.target.value); }); $$(".filter-chip").forEach((chip) => chip.addEventListener("click", () => { $$(".filter-chip").forEach(x => x.classList.toggle("active", x === chip)); renderPrices.limit = 80; renderPrices($("#price-search").value); }));
    document.addEventListener("click", (event) => { const row = event.target.closest(".price-row"); if (row && !event.target.closest("button")) row.classList.toggle("open"); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && $("#app").hidden === false && Date.now() - (refresh.last || 0) > 20000) refresh(); });
  }
  function initialize() {
    $("#state-filter").insertAdjacentHTML("beforeend", Rules.ORDER_STATES.map((state) => `<option>${esc(state)}</option>`).join(""));
    bindEvents(); if(localStorage.getItem("e30_theme")==="dark"){document.body.classList.add("theme-dark");$("#theme-toggle").textContent="☀ Activar modo claro";}
    const saved=getE30Settings(); for(const [id,key] of [["cfg-e30-name","e30Name"],["cfg-i30-name","i30Name"],["cfg-e30-address","e30Address"],["cfg-i30-address","i30Address"],["cfg-phone","phone"],["cfg-warranty-days","warrantyDays"],["cfg-warranty-terms","warrantyTerms"]])if(saved[key]!=null)$("#"+id).value=saved[key];
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return; // getSession() below owns the first load; avoid duplicate initial refresh.
      if (session) { showApp(session); setTimeout(() => refresh(), 0); } else showLogin();
    });
    sb.auth.getSession().then(({ data: sessionData, error }) => {
      if (error) return showLogin(error.message);
      if (!sessionData.session) return showLogin();
      showApp(sessionData.session); refresh();
    }).catch((error) => showLogin(error.message));
  }
  initialize();
})();
