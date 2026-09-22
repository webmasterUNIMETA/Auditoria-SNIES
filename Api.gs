/**
 * Api.gs
 * Validacion documental de docentes - Auditoria SNIES 2026-1
 *
 * Puerta de entrada del servidor. La pagina ya no la sirve Apps Script:
 * esta publicada en GitHub Pages y le habla a este proyecto por la URL
 * /exec con solicitudes POST que llevan JSON.
 *
 * POR QUE doGet YA NO DEVUELVE LA PAGINA
 * --------------------------------------
 * Toda pagina servida con HtmlService trae google.script.run, que permite
 * llamar a CUALQUIER funcion publica del proyecto: crearCarpetasDocentes,
 * consolidarCarpetas, inspeccionarDrive... Con el acceso abierto (que es
 * lo que exige hablar desde otro dominio) eso seria una puerta trasera.
 * Sin HtmlService, esas funciones solo se ejecutan desde el editor.
 *
 * COMO SE PROTEGE ENTONCES
 * ------------------------
 * El despliegue esta abierto, pero la aplicacion no. Cada peticion debe
 * traer el token de identidad que Google entrega al iniciar sesion en la
 * pagina. El servidor lo verifica contra Google y comprueba que:
 *
 *   - lo emitio Google y no ha caducado
 *   - fue emitido para ESTA aplicacion (aud == ID_CLIENTE_OAUTH)
 *   - el correo esta verificado
 *   - pertenece al dominio institucional (DOMINIO_AUTORIZADO)
 *   - aparece activo, con un rol permitido, en la hoja privada Usuarios
 *
 * Sin token valido no se responde absolutamente nada. Quien encuentre la
 * URL /exec no obtiene ni un dato.
 */

/* ============================================================
   CATALOGO DE ACCIONES
   ============================================================ */

/**
 * Unico catalogo de lo que la pagina puede pedir. Cualquier otra funcion
 * del proyecto es inalcanzable desde internet.
 */
var ACCIONES_API = {
  obtenerDocentes:       function (argumento, identidad) { return obtenerDocentes(identidad); },
  obtenerValidacion:     function (argumento, identidad) { return obtenerValidacion(argumento, identidad); },
  guardarValidacion:     function (argumento, identidad) { return guardarValidacion(argumento, identidad); },
  enviarARevision:       function (argumento, identidad) { return enviarARevision(argumento, identidad); },
  decidirRevision:       function (argumento, identidad) { return decidirRevision(argumento, identidad); },
  ponerEnSubsanacion:    function (argumento, identidad) { return ponerEnSubsanacion(argumento, identidad); },
  obtenerInformeGestion: function (argumento, identidad) { return obtenerInformeGestion(argumento, identidad); },
  confirmarRadicadoMen:  function (argumento, identidad) { return confirmarRadicadoMen(argumento, identidad); }
};

/* ============================================================
   ENRUTADOR
   ============================================================ */

/**
 * Recibe { token, accion, argumento } y responde { ok, resultado } o
 * { ok:false, error }.
 *
 * La pagina manda el JSON como text/plain a proposito: asi el navegador
 * no hace la consulta previa de CORS (OPTIONS), que Apps Script no sabe
 * responder. Google redirige la respuesta a script.googleusercontent.com,
 * que ya la entrega con permiso para cualquier origen.
 */
function doPost(e) {
  var peticion;
  try {
    peticion = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    return responderJson_({ ok: false, error: 'Solicitud no válida.' });
  }

  // 1. Identidad. Antes de mirar siquiera que se esta pidiendo.
  var identidad;
  try {
    identidad = verificarIdentidad_(peticion && peticion.token);
    identidad = autorizarUsuario_(identidad, peticion && peticion.rol);
  } catch (err) {
    console.warn('Acceso rechazado: ' + (err && err.message ? err.message : err));
    return responderJson_({
      ok: false,
      sesion: 'INVALIDA',            // la pagina usa esto para volver a pedir sesion
      error: err && err.message ? err.message : 'Sesión no válida.'
    });
  }

  // 2. Accion conocida.
  var nombre = peticion && typeof peticion.accion === 'string' ? peticion.accion : '';
  if (!Object.prototype.hasOwnProperty.call(ACCIONES_API, nombre)) {
    return responderJson_({ ok: false, error: 'Solicitud no reconocida.' });
  }

  // 3. Ejecucion.
  try {
    return responderJson_({ ok: true, resultado: ACCIONES_API[nombre](peticion.argumento, identidad) });
  } catch (err) {
    // Las acciones ya atrapan sus fallos internos y los relanzan con un
    // mensaje pensado para la persona, asi que se puede mostrar tal cual.
    console.error('doPost ' + nombre + ' [' + identidad.correo + ']: ' +
      (err && err.stack ? err.stack : err));
    return responderJson_({
      ok: false,
      error: err && err.message ? err.message : 'No fue posible atender la solicitud.'
    });
  }
}

/** Quien abra la URL del servidor en el navegador recibe solo un aviso. */
function doGet() {
  var configuracion = leerConfiguracion_();
  var texto = configuracion.urlSitio
    ? 'La aplicación de validación documental se encuentra en: ' + configuracion.urlSitio
    : 'Este es el servidor de la validación documental de docentes. ' +
      'Para usarla, abra el enlace que le entregó Talento Humano.';
  return ContentService.createTextOutput(texto);
}

function responderJson_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Prueba de mantenimiento para confirmar que la cuenta propietaria puede
 * consultar el servicio de verificación de Google. Se ejecuta manualmente
 * desde el editor; usa un token ficticio y no consulta datos de docentes.
 */
function probarConexionGoogle() {
  var respuesta = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=prueba_de_conexion',
    { muteHttpExceptions: true });

  var diagnostico = {
    codigo: respuesta.getResponseCode(),
    tipo: String(respuesta.getHeaders()['Content-Type'] || ''),
    respuestaJson: false
  };

  try {
    JSON.parse(respuesta.getContentText());
    diagnostico.respuestaJson = true;
  } catch (e) {
    diagnostico.respuestaJson = false;
  }

  console.log('Diagnóstico Google: ' + JSON.stringify(diagnostico));
  return diagnostico;
}

/* ============================================================
   IDENTIDAD
   ============================================================ */

/**
 * Comprueba el token de identidad que la pagina obtuvo de Google al
 * iniciar sesion, y devuelve { correo, nombre }.
 *
 * La verificacion se delega al propio Google (endpoint tokeninfo): es el
 * unico que puede decir si la firma es autentica. Verificar la firma aqui
 * exigiria criptografia RSA que Apps Script no ofrece.
 *
 * El resultado se guarda cinco minutos en cache: sin eso, cada clic de la
 * persona costaria una llamada de red adicional.
 */
function verificarIdentidad_(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Debe iniciar sesión para usar la aplicación.');
  }

  var configuracion = leerConfiguracion_();
  if (!configuracion.idClienteOauth) {
    throw new Error('Falta el parámetro ID_CLIENTE_OAUTH en la hoja Configuracion.');
  }

  var cache = CacheService.getScriptCache();
  var clave = 'ident_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));

  var guardado = cache.get(clave);
  if (guardado) return JSON.parse(guardado);

  var respuesta;
  try {
    respuesta = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true });
  } catch (e) {
    throw new Error('No fue posible verificar su sesión. Intente de nuevo.');
  }

  if (respuesta.getResponseCode() !== 200) {
    throw new Error('Su sesión expiró o no es válida. Vuelva a iniciar sesión.');
  }

  var datos;
  try {
    datos = JSON.parse(respuesta.getContentText());
  } catch (e) {
    throw new Error('No fue posible verificar su sesión. Intente de nuevo.');
  }

  // El token debe haber sido emitido para ESTA aplicacion. Sin esta
  // comprobacion valdria un token de cualquier otra aplicacion de Google.
  if (datos.aud !== configuracion.idClienteOauth) {
    throw new Error('La sesión no corresponde a esta aplicación.');
  }

  if (Number(datos.exp) * 1000 <= Date.now()) {
    throw new Error('Su sesión expiró. Vuelva a iniciar sesión.');
  }

  // tokeninfo devuelve los booleanos como texto.
  if (String(datos.email_verified) !== 'true' || !datos.email) {
    throw new Error('La cuenta no tiene un correo verificado.');
  }

  var correo = String(datos.email).toLowerCase();
  var dominio = String(configuracion.dominioAutorizado || '').toLowerCase();

  if (dominio) {
    var esDelDominio = datos.hd
      ? String(datos.hd).toLowerCase() === dominio
      : correo.slice(-(dominio.length + 1)) === '@' + dominio;

    if (!esDelDominio) {
      throw new Error('Esta aplicación es de uso interno. ' +
        'Inicie sesión con su cuenta institucional @' + dominio + '.');
    }
  }

  var identidad = { correo: correo, nombre: datos.name || correo };
  cache.put(clave, JSON.stringify(identidad), 300);
  return identidad;
}
