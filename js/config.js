// Configuración general de la consulta de saldos.
// Si cambia la URL del Apps Script, algún correo o enlace, solo se edita este archivo.

const CONFIG = {
  // URL de la implementación de Apps Script (termina en /exec)
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwpfJ1BV-lACO2iGGwpF2QU_7mIBD-c0D04G3jaqsQmVXDk65wwEMn11X2FYUqF2l05Hg/exec",

  CORREO_PARA: "rpulido@fodeocci.com.co",
  CORREO_COPIA: "gerencia@fodeocci.com.co",
  ASUNTO_CORREO: "Solicitud de devolución de saldo a favor – FODEOCCI",

  // Enlaces institucionales
  POLITICA_DATOS_URL: "PEGA_AQUI_URL_DE_LA_POLITICA_DE_DATOS",
  SITIO_WEB_URL: "https://fodeocci.com.co",

  MENSAJE_ERROR: "No fue posible completar tu consulta. Por favor, comunícate con FODEOCCI a través de nuestros canales oficiales de atención.",

  MENSAJE_BLOQUEADO: "Por seguridad, la consulta de este documento quedó bloqueada temporalmente debido a varios intentos fallidos. Intenta de nuevo en 30 minutos o comunícate con FODEOCCI a través de nuestros canales oficiales de atención.",

  MENSAJE_OCUPADO: "En este momento estamos recibiendo muchas consultas. Por favor, intenta de nuevo en unos minutos."
};