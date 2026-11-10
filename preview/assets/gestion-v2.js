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
      const client = order.clientes?.nombre || order.cliente || order.gremio || "";
    const phone = order.telefono || order.clientes?.telefono || "";
    const paid = (payments || []).reduce((sum, p) => sum + Number(p.importe || 0), 0);
    const due = Math.max(0, Number(order.total || 0) - paid);
    const settings=getE30Settings(); const brand = order.negocio === "i30" ? (settings.i30Name||"i30 | iPhone Service") : (settings.e30Name||"E30 | Técnico de celulares");
    const address = (order.negocio === "i30" ? settings.i30Address : settings.e30Address) || (order.negocio === "i30" ? "Moreno" : "Las Flores");
    const warrantyDays = order.garantia_dias == null ? 30 : Number(order.garantia_dias);
    const warrantyEnd = order.entregada && warrantyDays > 0
      ? new Date(new Date(order.entregada).getTime() + warrantyDays * 86400000).toLocaleDateString("es-AR") : "";
    const isDelivery = type === "entrega";
    const fault = isDelivery ? (order.trabajo_realizado || order.falla || "") : (order.falla || "");
    const terms = [warrantyDays === 0 ? "Trabajo sin garantía." : `Garantía: ${warrantyDays} días.`, order.garantia_condiciones || ""].filter(Boolean).join(" ");
    const trackingUrl = order.tracking_token ? (() => { const u = new URL("seguimiento.html", location.href); u.searchParams.set("t", order.tracking_token); return u.href; })() : "";
    const equipo = [order.marca, order.modelo].filter(Boolean).join(" ");
    const orderDate = date(isDelivery ? (order.entregada || new Date().toISOString()) : order.creada);
    $("#print-area").innerHTML = `<div class="ticket">
      <div class="ticket-brand">${esc(brand)}</div>
      ${address ? `<p class="ticket-address">${esc(address)}</p>` : ""}
      <div class="ticket-kind">${isDelivery ? "COMPROBANTE DE ENTREGA" : "COMPROBANTE DE RECEPCIÓN"}</div>
      <div class="ticket-order">ORDEN #${esc(order.id)}</div>
      ${orderDate ? `<p class="ticket-date">${isDelivery ? "Fecha de entrega" : "Fecha de recepción"}: ${orderDate}</p>` : ""}
      <hr class="ticket-rule">
      ${client || phone ? `<section class="ticket-section"><span class="ticket-label">CLIENTE</span>${client ? `<p class="ticket-value">${esc(client)}</p>` : ""}${phone ? `<p class="ticket-value ticket-sub">Tel. ${esc(phone)}</p>` : ""}</section>` : ""}
      ${equipo || order.imei ? `<section class="ticket-section"><span class="ticket-label">EQUIPO</span>${equipo ? `<p class="ticket-value">${esc(equipo)}</p>` : ""}${order.imei ? `<p class="ticket-value ticket-sub">IMEI: ${esc(order.imei)}</p>` : ""}</section>` : ""}
      ${!isDelivery && order.estado_ingreso ? `<section class="ticket-section"><span class="ticket-label">ESTADO DE INGRESO</span><p class="ticket-value">${esc(order.estado_ingreso)}</p></section>` : ""}
      ${fault ? `<section class="ticket-section"><span class="ticket-label">${isDelivery ? "TRABAJO REALIZADO" : "FALLA INFORMADA"}</span><p class="ticket-value">${esc(fault)}</p></section>` : ""}
      <hr class="ticket-rule">
      <span class="ticket-label">RESUMEN DE CUENTA</span>
      <div class="ticket-money">
        <div class="ticket-money-row"><span>Total</span><strong>${money(order.total)}</strong></div>
        <div class="ticket-money-row"><span>Pagado / seña</span><strong>${money(paid)}</strong></div>
        <div class="ticket-money-row ticket-balance"><span>Saldo</span><strong>${money(due)}</strong></div>
      </div>
      ${terms || (isDelivery && warrantyEnd) ? `<section class="ticket-section"><span class="ticket-label">GARANTÍA Y CONDICIONES</span><p class="ticket-terms">${esc(terms)}${isDelivery && warrantyEnd ? `<br><strong>Vencimiento de garantía: ${warrantyEnd}</strong>` : ""}</p></section>` : ""}
      <div class="ticket-sign"><div class="ticket-sign-line"></div>Firma y aclaración de conformidad</div>
      ${trackingUrl ? `<hr class="ticket-rule"><div class="ticket-tracking"><div id="tracking-qr"></div><b>SEGUIMIENTO ONLINE</b><small>Escaneá para consultar el estado de tu equipo</small></div>` : ""}
      <p class="ticket-thanks">Gracias por confiar en ${esc(order.negocio || brand)}.</p>
    </div>`;
    if (trackingUrl && window.QRCode) {
      new QRCode($("#tracking-qr"), { text: trackingUrl, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.L });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await printTicketWithQZ();
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
    const monthPayments = orders.flatMap((order) => (order.pagos || [])
      .filter((p) => new Date(p.creado) >= start)
      .map((p) => ({ ...p, negocio: order.negocio })));
    const sales = data.sales.filter((x) => new Date(x.creado) >= start);
    const explicitCollected = monthPayments.reduce((sum, row) => sum + Number(row.importe || 0), 0);
    // Al entregar una orden se considera cobrada al 100%; solo suma lo que faltaba para no duplicar pagos.
    const deliveryCollections = data.orders
      .filter((order) => order.estado === "Entregado" && order.entregada && new Date(order.entregada) >= start)
      .reduce((sum, order) => {
        const paidBeforeDelivery = (order.pagos || [])
          .filter((payment) => new Date(payment.creado) <= new Date(order.entregada))
          .reduce((total, payment) => total + Number(payment.importe || 0), 0);
        return sum + Math.max(0, Number(order.total || 0) - paidBeforeDelivery);
      }, 0);
    const collected = explicitCollected + deliveryCollections;
    const billed = orders.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const balance = orders.reduce((sum, row) => sum + Rules.balance(row), 0);
    const costedOrders = orders.filter((x) => x.costos_cargados);
    const cost = costedOrders.reduce((sum, row) => sum + Number(row.costo || 0), 0);
    const profit = costedOrders.reduce((sum, row) => sum + Number(row.total || 0) - Number(row.costo || 0), 0);
    $("#report-orders").textContent = String(orders.length);
    $("#report-billed").textContent = money(billed);
    $("#report-revenue").textContent = money(collected);
    $("#report-balance").textContent = money(balance);
    $("#report-cost").textContent = money(cost);
    $("#report-profit").textContent = money(profit);
    $("#report-sales").textContent = money(sales.reduce((sum, row) => sum + Number(row.total || 0), 0));

    $("#pending-costs-list").innerHTML = data.orders
      .filter((x) => x.estado === "Entregado" && !x.costos_cargados)
      .sort((a,b) => new Date(b.entregada || b.creada) - new Date(a.entregada || a.creada))
      .map(x => `<article class="order-row"><div class="row-main"><b>Orden #${x.id} · ${esc(x.modelo || "Equipo")}</b><small>${esc(x.cliente || x.gremio || "Cliente")} · ${esc(x.negocio)} · Entregada ${date(x.entregada)}</small></div><span class="state-pill pending">Costos pendientes</span><button class="button" data-costs="${x.id}">Completar costos</button></article>`)
      .join("") || `<div class="empty-state">No hay costos pendientes de completar.</div>`;

    $("#branch-report").innerHTML = Rules.BRANCHES.map((branch) => {
      const rows = orders.filter((x) => x.negocio === branch);
      const payments = monthPayments.filter((x) => x.negocio === branch);
      const branchSales = sales.filter((x) => x.sucursal === branch);
      const branchCosted = rows.filter((x) => x.costos_cargados);
      const branchBilled = rows.reduce((sum,x) => sum + Number(x.total || 0),0);
      const branchExplicitPaid = payments.reduce((sum,x) => sum + Number(x.importe || 0),0);
      const branchDeliveryPaid = rows
        .filter((order) => order.estado === "Entregado" && order.entregada && new Date(order.entregada) >= start)
        .reduce((sum, order) => {
          const paidBeforeDelivery = (order.pagos || [])
            .filter((payment) => new Date(payment.creado) <= new Date(order.entregada))
            .reduce((total, payment) => total + Number(payment.importe || 0), 0);
          return sum + Math.max(0, Number(order.total || 0) - paidBeforeDelivery);
        }, 0);
      const branchPaid = branchExplicitPaid + branchDeliveryPaid;
      const branchBalance = rows.reduce((sum,x) => sum + Rules.balance(x),0);
      const branchCost = branchCosted.reduce((sum,x) => sum + Number(x.costo || 0),0);
      const branchProfit = branchCosted.reduce((sum,x) => sum + Number(x.total || 0) - Number(x.costo || 0),0);
      const sold = branchSales.reduce((sum,x) => sum + Number(x.total || 0),0);
      return `<article class="order-row report-row">
        <div class="row-main"><b>${branch}</b><small>${rows.length} órdenes creadas · ${branchCosted.length} con costos completos</small></div>
        <div class="row-main"><small>Total acordado</small><b>${money(branchBilled)}</b></div>
        <div class="row-main"><small>Cobrado este mes</small><b>${money(branchPaid)}</b></div>
        <div class="row-main"><small>Saldo pendiente</small><b>${money(branchBalance)}</b></div>
        <div class="row-main"><small>Costos cargados</small><b>${money(branchCost)}</b></div>
        <div class="row-main"><small>Ganancia estimada</small><b>${money(branchProfit)}</b></div>
        <div class="row-main"><small>Ventas accesorios</small><b>${money(sold)}</b></div>
      </article>`;
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
      if (session) { showApp(session); setTimeout(() => { refresh(); startRemotePrintReceiver(); }, 0); } else showLogin();
    });
    sb.auth.getSession().then(({ data: sessionData, error }) => {
      if (error) return showLogin(error.message);
      if (!sessionData.session) return showLogin();
      showApp(sessionData.session); refresh(); startRemotePrintReceiver();
    }).catch((error) => showLogin(error.message));
  }
  initialize();
})();
