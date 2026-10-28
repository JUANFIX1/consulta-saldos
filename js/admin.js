// Lógica del panel de administración.
// Depende de CONFIG (js/config.js) y de SheetJS (js/vendor/xlsx.full.min.js).

const $ = id => document.getElementById(id);

const dinero = n => new Intl.NumberFormat("es-CO", {
  style: "currency", currency: "COP", maximumFractionDigits: 0
}).format(n);

// Columnas de la plantilla (deben coincidir con las de la hoja Saldos)
const COLUMNAS = ["tipo_documento", "numero_documento", "nombre_completo",
                  "fecha_nacimiento", "valor_saldo", "estado_saldo", "fecha_corte"];
const TAMANO_MAXIMO_MB = 5;

// El token de sesión solo dura mientras la pestaña esté abierta
let token = sessionStorage.getItem("adminToken");

// Datos ya validados, a la espera de "Confirmar carga"
let cargaPendiente = null;

// Registro abierto en la ficha { tipo, numero }
let registroActual = null;

$("formLogin").addEventListener("submit", ingresar);
$("btnSalir").addEventListener("click", salir);
$("btnRefrescar").addEventListener("click", cargarEstado);
$("btnPlantilla").addEventListener("click", descargarPlantilla);
$("archivoExcel").addEventListener("change", reiniciarCarga);
$("btnValidar").addEventListener("click", validarArchivo);
$("btnConfirmar").addEventListener("click", confirmarCarga);
$("formBuscar").addEventListener("submit", buscarRegistro);
$("formRegistro").addEventListener("submit", guardarRegistro);
$("btnEliminar").addEventListener("click", eliminarRegistro);
$("formDesbloquear").addEventListener("submit", desbloquear);

// Si ya había una sesión abierta en esta pestaña, entra directo al panel
if (token) mostrarPanel();

// Envía una acción al Apps Script junto con el token de sesión
async function llamarApi(accion, datos = {}) {
  const resp = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ accion, token, ...datos })
  });
  const data = await resp.json();
  if (data.sesion === false) cerrarSesionLocal(data.mensaje);
  return data;
}

// ---------------------------------------------------------------- Sesión

async function ingresar(evento) {
  evento.preventDefault();
  const aviso = $("avisoLogin");
  const boton = $("btnIngresar");

  aviso.hidden = true;
  boton.disabled = true;
  boton.textContent = "Verificando...";

  try {
    const data = await llamarApi("admin_login", { clave: $("clave").value });
    if (data.ok) {
      token = data.token;
      sessionStorage.setItem("adminToken", token);
      $("clave").value = "";
      mostrarPanel();
    } else {
      mostrarAviso(aviso, data.mensaje, false);
    }
  } catch (err) {
    console.error(err);
    mostrarAviso(aviso, "No se pudo conectar con el servidor.", false);
  } finally {
    boton.disabled = false;
    boton.textContent = "Ingresar";
  }
}

function mostrarPanel() {
  $("vistaLogin").hidden = true;
  $("vistaPanel").hidden = false;
  cargarEstado();
}

async function salir() {
  try {
    await llamarApi("admin_salir");
  } catch (err) {
    console.error(err);
  }
  cerrarSesionLocal();
}

function cerrarSesionLocal(mensaje) {
  token = null;
  sessionStorage.removeItem("adminToken");
  reiniciarCarga();
  cerrarFicha();
  $("vistaPanel").hidden = true;
  $("vistaLogin").hidden = false;
  if (mensaje) mostrarAviso($("avisoLogin"), mensaje, false);
}

// ---------------------------------------------------------------- Estado

// Vuelve a leer el Google Sheet (útil si alguien lo editó directamente allá)
async function cargarEstado() {
  const boton = $("btnRefrescar");
  const hora = $("estHora");
  boton.disabled = true;
  boton.textContent = "Actualizando...";

  try {
    const data = await llamarApi("admin_estado");
    if (!data.ok) {
      hora.textContent = data.mensaje || "No se pudieron leer los datos.";
      return;
    }
    $("estTotal").textContent = data.totalRegistros;
    $("estConSaldo").textContent = data.conSaldo;
    $("estSuma").textContent = dinero(data.totalSaldo);
    $("estCorte").textContent = data.fechasCorte.join(", ") || "--";
    $("estActualizacion").textContent = data.ultimaActualizacion || "Sin cambios desde el panel";
    hora.textContent = "Datos leídos a las " +
      new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch (err) {
    console.error(err);
    hora.textContent = "No se pudo conectar con el servidor.";
  } finally {
    boton.disabled = false;
    boton.textContent = "Actualizar datos";
  }
}

// ---------------------------------------------------------------- Carga de Excel

function descargarPlantilla() {
  const hoja = XLSX.utils.aoa_to_sheet([
    COLUMNAS,
    ["CC", "1010101010", "Nombre Apellido Apellido", "14/03/1985", 350000, "Disponible", "15/10/2026"]
  ]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Saldos");
  XLSX.writeFile(libro, "plantilla_saldos_fodeocci.xlsx");
}

function reiniciarCarga() {
  cargaPendiente = null;
  $("avisoCarga").hidden = true;
  $("detalleErrores").hidden = true;
  $("confirmacionCarga").hidden = true;
}

async function validarArchivo() {
  reiniciarCarga();
  const archivo = $("archivoExcel").files[0];
  const aviso = $("avisoCarga");

  if (!archivo) {
    mostrarAviso(aviso, "Selecciona un archivo primero.", false);
    return;
  }
  if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
    mostrarAviso(aviso, "El archivo supera el tamaño máximo de " + TAMANO_MAXIMO_MB + " MB.", false);
    return;
  }

  const boton = $("btnValidar");
  boton.disabled = true;
  boton.textContent = "Validando...";

  try {
    const datos = await leerExcel(archivo);
    const data = await llamarApi("admin_validar", datos);

    if (!data.ok) {
      mostrarAviso(aviso, data.mensaje, false);
    } else if (data.totalErrores > 0) {
      mostrarAviso(aviso, "Se encontraron " + data.totalErrores + " fila(s) con problemas, de " + data.total +
        " registros. Corrige el archivo y vuelve a validarlo.", false);
      mostrarErrores(data.errores, data.totalErrores);
    } else {
      mostrarAviso(aviso, "Archivo válido: " + data.total + " registros, " + data.conSaldo +
        " con saldo disponible por un total de " + dinero(data.totalSaldo) + ".", true);
      cargaPendiente = { ...datos, archivo: archivo.name };
      $("confirmacionCarga").hidden = false;
    }
  } catch (err) {
    console.error(err);
    mostrarAviso(aviso, "No se pudo leer o validar el archivo. Verifica que sea un Excel válido.", false);
  } finally {
    boton.disabled = false;
    boton.textContent = "Validar archivo";
  }
}

async function confirmarCarga() {
  if (!cargaPendiente) return;
  if (!confirm("¿Seguro que quieres reemplazar la base de datos actual con este archivo?")) return;

  const boton = $("btnConfirmar");
  boton.disabled = true;
  boton.textContent = "Cargando...";

  try {
    const data = await llamarApi("admin_cargar", cargaPendiente);
    mostrarAviso($("avisoCarga"), data.mensaje, data.ok);
    if (data.ok) {
      $("confirmacionCarga").hidden = true;
      $("archivoExcel").value = "";
      cargaPendiente = null;
      cerrarFicha();
      cargarEstado();
    }
  } catch (err) {
    console.error(err);
    mostrarAviso($("avisoCarga"), "No se pudo completar la carga.", false);
  } finally {
    boton.disabled = false;
    boton.textContent = "Confirmar carga";
  }
}

// Lee la primera hoja del Excel y la convierte en { columnas, filas }
async function leerExcel(archivo) {
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: "" });

  const columnas = (matriz[0] || []).map(normalizarEncabezado);

  const filas = matriz.slice(1)
    .map((celdas, i) => {
      const fila = { _fila: i + 2 }; // número de fila real en Excel (la 1 es el encabezado)
      columnas.forEach((col, j) => { fila[col] = convertirCelda(col, celdas[j]); });
      return { fila, vacia: celdas.every(c => String(c).trim() === "") };
    })
    .filter(f => !f.vacia)
    .map(f => f.fila);

  return { columnas, filas };
}

// "Fecha de Nacimiento" -> "fecha_de_nacimiento"; "Fecha_Nacimiento" -> "fecha_nacimiento"
function normalizarEncabezado(texto) {
  return String(texto).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function convertirCelda(columna, valor) {
  if (columna.startsWith("fecha_")) return fechaATexto(valor);
  if (typeof valor === "string") return valor.trim();
  return valor;
}

// Convierte una fecha de Excel (número de serie o texto dd/mm/aaaa) a "AAAA-MM-DD"
function fechaATexto(valor) {
  if (typeof valor === "number") {
    const fecha = new Date(Math.round((valor - 25569) * 86400000)); // 25569 = días entre 1899-12-30 y 1970-01-01
    return fecha.toISOString().slice(0, 10);
  }
  const texto = String(valor).trim();
  const dma = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dma) return dma[3] + "-" + dma[2].padStart(2, "0") + "-" + dma[1].padStart(2, "0");
  return texto; // si no se reconoce, el servidor lo marcará como fecha no válida
}

function mostrarErrores(errores, total) {
  const cuerpo = $("cuerpoErrores");
  cuerpo.replaceChildren();
  errores.forEach(e => {
    const tr = document.createElement("tr");
    [e.fila, e.documento, e.problemas].forEach(texto => {
      const td = document.createElement("td");
      td.textContent = texto;
      tr.append(td);
    });
    cuerpo.append(tr);
  });

  const nota = $("notaErrores");
  nota.hidden = total <= errores.length;
  nota.textContent = "Se muestran las primeras " + errores.length + " filas con problemas de " + total + ".";
  $("detalleErrores").hidden = false;
}

// ---------------------------------------------------------------- Administrar registros

async function buscarRegistro(evento) {
  evento.preventDefault();
  cerrarFicha();
  const aviso = $("avisoRegistro");
  const tipo = $("buscarTipo").value;
  const numero = $("buscarNumero").value.trim();

  if (!tipo || !numero) {
    mostrarAviso(aviso, "Indica el tipo y el número de documento.", false);
    return;
  }

  const boton = $("btnBuscar");
  boton.disabled = true;
  boton.textContent = "Buscando...";

  try {
    const data = await llamarApi("admin_buscar", { tipo, numero });
    if (data.ok) {
      mostrarFicha(data.registro);
    } else {
      mostrarAviso(aviso, data.mensaje, false);
    }
  } catch (err) {
    console.error(err);
    mostrarAviso(aviso, "No se pudo conectar con el servidor.", false);
  } finally {
    boton.disabled = false;
    boton.textContent = "Buscar";
  }
}

function mostrarFicha(r) {
  registroActual = { tipo: r.tipo, numero: r.numero };
  $("fichaDocumento").textContent = r.tipo + " " + r.numero;
  $("regNombre").value = r.nombre;
  $("regNacimiento").value = r.nacimiento;
  $("regValor").value = r.valor;
  $("regEstado").value = r.estado;
  $("regCorte").value = r.corte;
  $("formRegistro").hidden = false;
}

function cerrarFicha() {
  registroActual = null;
  $("formRegistro").hidden = true;
  $("avisoRegistro").hidden = true;
}

async function guardarRegistro(evento) {
  evento.preventDefault();
  if (!registroActual) return;

  const datos = {
    ...registroActual,
    nombre: $("regNombre").value.trim(),
    nacimiento: $("regNacimiento").value,
    valor: $("regValor").value,
    estado: $("regEstado").value,
    corte: $("regCorte").value
  };

  const boton = $("btnGuardar");
  boton.disabled = true;
  boton.textContent = "Guardando...";

  try {
    const data = await llamarApi("admin_guardar", datos);
    mostrarAviso($("avisoRegistro"), data.mensaje, data.ok);
    if (data.ok) cargarEstado();
  } catch (err) {
    console.error(err);
    mostrarAviso($("avisoRegistro"), "No se pudo conectar con el servidor.", false);
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar cambios";
  }
}

async function eliminarRegistro() {
  if (!registroActual) return;
  const doc = registroActual.tipo + " " + registroActual.numero;
  if (!confirm("¿Seguro que quieres eliminar el registro " + doc + "? Esta persona ya no podrá consultar su saldo.")) return;

  try {
    const data = await llamarApi("admin_eliminar", registroActual);
    if (data.ok) {
      cerrarFicha();
      $("formBuscar").reset();
      cargarEstado();
    }
    mostrarAviso($("avisoRegistro"), data.mensaje, data.ok);
  } catch (err) {
    console.error(err);
    mostrarAviso($("avisoRegistro"), "No se pudo conectar con el servidor.", false);
  }
}

// ---------------------------------------------------------------- Desbloqueo

async function desbloquear(evento) {
  evento.preventDefault();
  const aviso = $("avisoDesbloqueo");
  const tipo = $("desTipo").value;
  const numero = $("desNumero").value.trim();

  if (!tipo || !numero) {
    mostrarAviso(aviso, "Indica el tipo y el número de documento.", false);
    return;
  }

  try {
    const data = await llamarApi("admin_desbloquear", { tipo, numero });
    mostrarAviso(aviso, data.mensaje, data.ok);
    if (data.ok) $("formDesbloquear").reset();
  } catch (err) {
    console.error(err);
    mostrarAviso(aviso, "No se pudo conectar con el servidor.", false);
  }
}

// ---------------------------------------------------------------- Utilidades

function mostrarAviso(caja, texto, exito) {
  caja.textContent = texto;
  caja.className = "resultado " + (exito ? "ok" : "error");
  caja.hidden = false;
}