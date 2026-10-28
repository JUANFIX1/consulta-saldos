// Lógica de la página pública de consulta de saldos a favor.
// Depende de CONFIG (js/config.js), que debe cargarse antes.

const dinero = n => new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0
}).format(n);

const $ = id => document.getElementById(id);

// Enlaces institucionales (se toman de config.js)
document.querySelectorAll("[data-politica]").forEach(a => { a.href = CONFIG.POLITICA_DATOS_URL; });
document.querySelectorAll("[data-sitio]").forEach(a => { a.href = CONFIG.SITIO_WEB_URL; });

// No permitir fechas de nacimiento en el futuro
$("fecha").max = new Date().toISOString().slice(0, 10);

$("formConsulta").addEventListener("submit", consultar);
$("btnNuevaConsulta").addEventListener("click", nuevaConsulta);

async function consultar(evento) {
  evento.preventDefault(); // evita que el formulario recargue la página

  const tipo = $("tipo").value;
  const numero = $("numero").value.trim();
  const fecha = $("fecha").value; // AAAA-MM-DD
  const aviso = $("avisoCampos");
  const boton = $("btnConsultar");

  aviso.hidden = true;
  if (!tipo || !numero || !fecha) {
    aviso.textContent = "Por favor completa los tres campos.";
    aviso.hidden = false;
    return;
  }

  boton.disabled = true;
  boton.textContent = "Consultando...";

  let data;
  try {
    // text/plain evita la verificación previa (CORS) que Apps Script no soporta
    const resp = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ tipo, numero, fecha })
    });
    data = await resp.json();
  } catch (err) {
    console.error(err);
    data = { resultado: "error" };
  } finally {
    boton.disabled = false;
    boton.textContent = "Consultar";
  }

  mostrarResultado(data, tipo, numero);
}

// Arma el comprobante según el resultado y lo muestra en lugar de las dos columnas
function mostrarResultado(data, tipo, numero) {
  const caja = $("resultado");
  caja.replaceChildren(); // limpia el resultado anterior
  let textoBoton = "Hacer otra consulta";

  if (data.resultado === "con_saldo") {
    caja.append(
      icono("exito"),
      crearCon("span", "eyebrow", "RESULTADO DE TU CONSULTA"),
      crear("h2", "¡Tienes un saldo a favor en FODEOCCI!"),
      crearCon("p", "comprobante-monto", dinero(data.valor)),
      crear("p", "Saldo a favor registrado en FODEOCCI, con corte al " + data.fechaCorte),
      detalles([
        ["Titular", data.nombre],
        ["Documento", tipo + " " + enmascarar(numero)]
      ]),
      crearCon("div", "solicitud",
        crearCon("span", "eyebrow", "PASO 2 · ENVÍA TU SOLICITUD"),
        crear("p", "Para solicitar la devolución, envía una certificación bancaria de una cuenta a tu nombre al correo ",
          crear("strong", CONFIG.CORREO_PARA), ", con copia a ", crear("strong", CONFIG.CORREO_COPIA), "."),
        crear("p", "FODEOCCI verificará la información y gestionará la devolución de acuerdo con los requisitos establecidos."),
        ...accionesCorreo(armarCorreo(data, tipo, numero))
      )
    );

  } else if (data.resultado === "sin_saldo") {
    caja.append(
      icono("info"),
      crearCon("span", "eyebrow", "RESULTADO DE TU CONSULTA"),
      crear("h2", "No tienes saldos pendientes"),
      crear("p", "De acuerdo con nuestros registros, no presentas saldos a favor pendientes de devolución en FODEOCCI, con corte al " + data.fechaCorte + "."),
      detalles([
        ["Documento", tipo + " " + enmascarar(numero)],
        ["Fecha de corte", data.fechaCorte]
      ])
    );

  } else {
    const mensajes = { bloqueado: CONFIG.MENSAJE_BLOQUEADO, ocupado: CONFIG.MENSAJE_OCUPADO };
    caja.append(
      icono("error"),
      crear("h2", "No pudimos completar tu consulta"),
      crear("p", mensajes[data.resultado] || CONFIG.MENSAJE_ERROR)
    );
    textoBoton = "Intentar de nuevo";
  }

  $("btnNuevaConsulta").textContent = textoBoton;
  $("vistaConsulta").hidden = true;
  $("vistaResultado").hidden = false;
  window.scrollTo(0, 0);
}

// Crea un elemento con texto seguro (nunca interpreta HTML que venga de los datos)
function crear(etiqueta, ...contenido) {
  const el = document.createElement(etiqueta);
  el.append(...contenido);
  return el;
}

// Igual que crear(), pero con una clase CSS
function crearCon(etiqueta, clase, ...contenido) {
  const el = crear(etiqueta, ...contenido);
  el.className = clase;
  return el;
}

// Lista de datos del comprobante: [["Titular", "María..."], ...]
function detalles(filas) {
  const lista = crearCon("dl", "comprobante-detalles");
  filas.forEach(([etiqueta, valor]) => lista.append(crear("div", crear("dt", etiqueta), crear("dd", valor))));
  return lista;
}

// Círculo con ícono: "exito" (check), "info" (i) o "error" (!)
function icono(tipo) {
  const trazos = {
    exito: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v6M12 16.5h.01"/>'
  };
  const circulo = crearCon("div", "comprobante-icono " + tipo);
  circulo.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + trazos[tipo] + "</svg>";
  return circulo;
}

// "1010101010" -> "******1010" (por si alguien ve la pantalla por encima del hombro)
function enmascarar(numero) {
  return numero.length <= 4 ? numero : "*".repeat(numero.length - 4) + numero.slice(-4);
}

// ---------------------------------------------------------------- Correo de solicitud

function armarCorreo(data, tipo, numero) {
  const cuerpo =
    "Señores FODEOCCI:\n\n" +
    "Por medio del presente solicito la devolución de mi saldo a favor, de acuerdo con la siguiente información:\n\n" +
    "Nombre: " + data.nombre + "\n" +
    "Documento: " + tipo + " " + numero + "\n" +
    "Valor del saldo: " + dinero(data.valor) + "\n" +
    "Fecha de corte: " + data.fechaCorte + "\n\n" +
    "Adjunto la certificación bancaria de una cuenta a mi nombre.\n\n" +
    "(RECUERDA ADJUNTAR LA CERTIFICACIÓN BANCARIA ANTES DE ENVIAR)\n\n" +
    "Cordialmente,\n" + data.nombre;

  return { para: CONFIG.CORREO_PARA, copia: CONFIG.CORREO_COPIA, asunto: CONFIG.ASUNTO_CORREO, cuerpo };
}

// Botón principal (aplicación de correo) + alternativas (Gmail y copiar)
function accionesCorreo(correo) {
  const botonCorreo = crear("a", "Enviar solicitud por correo");
  botonCorreo.className = "boton";
  botonCorreo.href = "mailto:" + correo.para +
    "?cc=" + encodeURIComponent(correo.copia) +
    "&subject=" + encodeURIComponent(correo.asunto) +
    "&body=" + encodeURIComponent(correo.cuerpo);

  const gmail = crear("a", "Abrir en Gmail");
  gmail.target = "_blank";
  gmail.rel = "noopener";
  gmail.href = "https://mail.google.com/mail/?view=cm&fs=1" +
    "&to=" + encodeURIComponent(correo.para) +
    "&cc=" + encodeURIComponent(correo.copia) +
    "&su=" + encodeURIComponent(correo.asunto) +
    "&body=" + encodeURIComponent(correo.cuerpo);

  const estado = crear("span");
  estado.className = "estado-copiado";
  estado.hidden = true;

  const copiar = crear("button", "Copiar mensaje");
  copiar.type = "button";
  copiar.addEventListener("click", () => copiarMensaje(correo, estado));

  const opciones = crear("p", "¿No se abrió tu correo? ", gmail, " · ", copiar, estado);
  opciones.className = "opciones-correo";

  return [botonCorreo, opciones];
}

async function copiarMensaje(correo, estado) {
  const texto =
    "Para: " + correo.para + "\n" +
    "Con copia a: " + correo.copia + "\n" +
    "Asunto: " + correo.asunto + "\n\n" +
    correo.cuerpo;

  try {
    await navigator.clipboard.writeText(texto);
    estado.textContent = "Mensaje copiado. Pégalo en un correo nuevo y adjunta tu certificación bancaria.";
  } catch (err) {
    console.error(err);
    estado.textContent = "No se pudo copiar automáticamente. Escribe a " + correo.para + " con copia a " + correo.copia + ".";
  }
  estado.hidden = false;
}

function nuevaConsulta() {
  $("formConsulta").reset();
  $("vistaResultado").hidden = true;
  $("vistaConsulta").hidden = false;
  window.scrollTo(0, 0);
}