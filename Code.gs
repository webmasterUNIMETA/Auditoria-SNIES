/**
 * Code.gs
 * Validacion documental de docentes - Auditoria SNIES 2026-1
 * Corporacion Universitaria del Meta - UNIMETA
 *
 * Todo el servidor de la aplicacion vive en este archivo: configuracion,
 * lectura de las hojas, manejo de Drive, calculo de estados y las acciones
 * que usa la pagina.
 *
 * REGLA DE ORO: la hoja "Docentes" NUNCA se modifica. Es la foto de lo
 * reportado a SNIES. Todo lo que registra el auditor vive en la hoja
 * "Validaciones", identificada por NUM_DOCUMENTO.
 *
 * CONVENCION DE NOMBRES: las funciones que terminan en guion bajo son
 * internas. Apps Script no permite invocarlas desde el navegador con
 * google.script.run, de modo que la unica superficie expuesta es:
 *
 *   obtenerDocentes()
 *   obtenerValidacion(documento)
 *   guardarValidacion(payload)
 */

/* ============================================================
   CONSTANTES
   ============================================================ */

var HOJA_DOCENTES     = 'Docentes';
var HOJA_VALIDACIONES = 'Validaciones';
var HOJA_CONFIG       = 'Configuracion';
var HOJA_USUARIOS     = 'Usuarios';
var HOJA_HISTORIAL    = 'HistorialRevisiones';

/** Roles autorizados. El correo y el rol viven solo en la hoja privada Usuarios. */
var ROL_TALENTO_HUMANO = 'TALENTO_HUMANO';
var ROL_REVISOR        = 'REVISOR';
var ROL_CONSULTA       = 'CONSULTA';

/** Flujo formal, separado del resultado tecnico de la validacion. */
var REV_POR_ENVIAR = 'POR_ENVIAR';
var REV_EN_REVISION = 'EN_REVISION';
var REV_DEVUELTO = 'DEVUELTO';
var REV_APROBADO = 'APROBADO';

/** Etapa operativa posterior a la aprobacion documental. */
var MEN_PENDIENTE = 'PENDIENTE';
var MEN_SUBSANACION = 'SUBSANACION';
var MEN_LISTO = 'LISTO_RADICAR';
var MEN_RADICADO = 'RADICADO';

var REV_CONFORME = 'CONFORME';
var REV_NO_CONFORME = 'NO_CONFORME';

/** Estado de un docente dentro de la auditoria. */
var ESTADO_PENDIENTE  = 'PENDIENTE';
var ESTADO_VALIDADO   = 'VALIDADO';
var ESTADO_CORRECCION = 'REQUIERE_CORRECCION';

/** Unicos valores admitidos en las columnas VAL_*. */
var COINCIDE    = 'COINCIDE';
var NO_COINCIDE = 'NO_COINCIDE';

/** Limite por archivo. Mas alla de esto la carga se vuelve inestable. */
var MAX_BYTES_PDF = 10 * 1024 * 1024;

var NOMBRE_ACTA    = '01_ACTA_GRADO.pdf';
var NOMBRE_DIPLOMA = '02_DIPLOMA_GRADO.pdf';

/**
 * Los diez criterios de la revision. Es la unica fuente de verdad: la
 * pagina los dibuja a partir de esta lista y el servidor valida contra
 * ella, de modo que no pueden desincronizarse.
 *
 *   clave    -> sufijo de las columnas VAL_<clave> y CORR_<clave>
 *   etiqueta -> lo que lee el auditor
 *   campo    -> encabezado de la hoja Docentes con el valor reportado
 */
var CRITERIOS = [
  { clave: 'NUM_DOCUMENTO',    etiqueta: 'Número de documento',                     campo: 'NUM_DOCUMENTO' },
  { clave: 'PRIMER_NOMBRE',    etiqueta: 'Primer nombre',                           campo: 'PRIMER_NOMBRE',    normalizarCorreccion: 'mayusculas' },
  { clave: 'SEGUNDO_NOMBRE',   etiqueta: 'Segundo nombre',                          campo: 'SEGUNDO_NOMBRE',   normalizarCorreccion: 'mayusculas' },
  { clave: 'PRIMER_APELLIDO',  etiqueta: 'Primer apellido',                         campo: 'PRIMER_APELLIDO',  normalizarCorreccion: 'mayusculas' },
  { clave: 'SEGUNDO_APELLIDO', etiqueta: 'Segundo apellido',                        campo: 'SEGUNDO_APELLIDO', normalizarCorreccion: 'mayusculas' },
  {
    clave: 'NIVEL_ESTUDIO',
    etiqueta: 'Máximo nivel de estudio reportado SNIES',
    campo: 'DESC_NIVEL_ESTUDIO_DOCENTE',
    opcionesCorreccion: ['ESPECIALIZACIÓN UNIVERSITARIA', 'MAESTRÍA'],
    normalizarCorreccion: 'mayusculas'
  },
  { clave: 'TITULO',           etiqueta: 'Título obtenido',                         campo: 'TITULO_RECIBIDO', normalizarCorreccion: 'mayusculas' },
  {
    clave: 'FECHA_GRADO',
    etiqueta: 'Fecha de grado',
    campo: 'FECHA_GRADO',
    tipoCorreccion: 'fecha'
  },
  { clave: 'PAIS',             etiqueta: 'País donde estudió',                      campo: 'DESC_PAIS_INSTITUCION_ESTUDIO' },
  { clave: 'IES',              etiqueta: 'Nombre de la IES donde estudió',          campo: 'IES_ESTUDIO_NOMBRE', normalizarCorreccion: 'mayusculas' }
];

/** Encabezados que debe tener la hoja Validaciones, en orden. */
function encabezadosValidaciones_() {
  var fila = ['NUM_DOCUMENTO', 'FECHA_VALIDACION'];
  CRITERIOS.forEach(function (c) {
    fila.push('VAL_' + c.clave);
    fila.push('CORR_' + c.clave);
  });
  return fila.concat([
    // Trazabilidad entre la hoja y Drive: de cada soporte se guarda el
    // identificador (estable, sirve para localizarlo aunque lo muevan) y
    // la URL (para abrirlo desde la ficha).
    'ID_CARPETA_DOCENTE', 'URL_CARPETA_DOCENTE',
    'ID_ACTA', 'URL_ACTA',
    'ID_DIPLOMA', 'URL_DIPLOMA',
    'OBSERVACIONES', 'ESTADO', 'FECHA_MODIFICACION',
    'ESTADO_REVISION', 'VERSION', 'GUARDADO_POR',
    'ENVIADO_POR', 'FECHA_ENVIO',
    'REVISADO_POR', 'FECHA_REVISION',
    'DECISION_REVISION', 'OBSERVACION_REVISION',
    'ESTADO_MEN',
    'MOTIVO_SUBSANACION', 'FECHA_SUBSANACION',
    'FECHA_DISPONIBLE_RADICACION', 'SUBSANACION_POR',
    'RADICADO_MEN', 'RADICADO_POR', 'FECHA_RADICACION_MEN'
  ]).concat(CRITERIOS.map(function (c) {
    return 'REV_' + c.clave;
  })).concat(CRITERIOS.map(function (c) {
    return 'REV_CORR_' + c.clave;
  }));
}

/** Etiqueta legible de un criterio. */
function etiquetaCriterio_(clave) {
  for (var i = 0; i < CRITERIOS.length; i++) {
    if (CRITERIOS[i].clave === clave) return CRITERIOS[i].etiqueta;
  }
  return clave;
}

/*
 * La puerta de entrada vive en Api.gs: doPost() para la pagina y doGet()
 * solo para devolver un aviso. Este archivo no sirve HTML a proposito,
 * porque HtmlService traeria consigo google.script.run y con el despliegue
 * abierto eso dejaria todas las funciones del proyecto al alcance de
 * cualquiera. Ver la cabecera de Api.gs.
 */

/* ============================================================
   LIBRO Y HOJAS
   ============================================================ */

/**
 * El libro de la auditoria. Normalmente el proyecto esta enlazado a la
 * hoja de calculo; si se publica como proyecto suelto, basta con dejar el
 * identificador en la propiedad de script ID_HOJA_CALCULO.
 */
function libro_() {
  var activo = SpreadsheetApp.getActiveSpreadsheet();
  if (activo) return activo;

  var id = PropertiesService.getScriptProperties().getProperty('ID_HOJA_CALCULO');
  if (!id) {
    throw new Error('El proyecto no está enlazado a la hoja de cálculo. ' +
      'Defina la propiedad de script ID_HOJA_CALCULO con el identificador del libro.');
  }
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error('No fue posible abrir la hoja de cálculo indicada en ID_HOJA_CALCULO.');
  }
}

function hojaDe_(nombre) {
  var hoja = libro_().getSheetByName(nombre);
  if (!hoja) throw new Error('No se encontró la hoja "' + nombre + '" en el libro de la auditoría.');
  return hoja;
}

/* ============================================================
   USUARIOS Y PERMISOS
   ============================================================ */

function encabezadosUsuarios_() {
  return ['CORREO', 'ROL', 'ACTIVO', 'NOMBRE'];
}

/**
 * Crea la plantilla privada de control de acceso. Los correos se escriben
 * directamente en Sheets y nunca forman parte del codigo ni del sitio publico.
 */
function prepararUsuarios() {
  var libro = libro_();
  var hoja = libro.getSheetByName(HOJA_USUARIOS);
  var creada = false;

  if (!hoja) {
    hoja = libro.insertSheet(HOJA_USUARIOS);
    creada = true;
  }

  if (hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, 4).setValues([encabezadosUsuarios_()]).setFontWeight('bold');
    hoja.getRange(2, 1, 6, 4).setValues([
      ['', ROL_TALENTO_HUMANO, 'SI', 'Talento Humano 1'],
      ['', ROL_TALENTO_HUMANO, 'SI', 'Talento Humano 2'],
      ['', ROL_TALENTO_HUMANO, 'SI', 'Talento Humano 3'],
      ['', ROL_REVISOR,        'SI', 'Revisor'],
      ['', ROL_CONSULTA,       'SI', 'Consulta 1'],
      ['', ROL_CONSULTA,       'SI', 'Consulta 2']
    ]);
    hoja.setFrozenRows(1);
    hoja.autoResizeColumns(1, 4);
  } else {
    var actuales = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var mapa = mapaEncabezados_(actuales);
    var faltantes = encabezadosUsuarios_().filter(function (e) {
      return !mapa[normalizarEncabezado_(e)];
    });
    if (faltantes.length) {
      hoja.getRange(1, hoja.getLastColumn() + 1, 1, faltantes.length)
          .setValues([faltantes]).setFontWeight('bold');
    }
  }

  return (creada ? 'Hoja Usuarios creada. ' : 'Hoja Usuarios lista. ') +
    'Complete los seis correos institucionales y conserve ACTIVO = SI.';
}

/** Agrega o actualiza una sola cuenta sin alterar los demás usuarios. */
function agregarUsuarioPrivado(correo, rol, nombre) {
  var email = String(correo || '').trim().toLowerCase();
  var rolesNormalizados = normalizarRolesUsuario_(rol);
  var rolGuardado = rolesNormalizados.join(', ');
  var nombreLimpio = textoEntrante_(nombre, 100) || rolGuardado;
  var dominio = String(leerConfiguracion_().dominioAutorizado || '').toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('El correo indicado no es válido.');
  }
  if (dominio && email.slice(-(dominio.length + 1)) !== '@' + dominio) {
    throw new Error('El correo no pertenece al dominio institucional autorizado.');
  }
  prepararUsuarios();
  var hoja = hojaDe_(HOJA_USUARIOS);
  var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
  var mapa = mapaEncabezados_(datos[0]);
  exigirColumnas_(mapa, ['CORREO', 'ROL', 'ACTIVO', 'NOMBRE'], HOJA_USUARIOS);

  var filaDestino = hoja.getLastRow() + 1;
  for (var i = 1; i < datos.length; i++) {
    if (texto_(datos[i][mapa.CORREO - 1]).toLowerCase() === email) {
      filaDestino = i + 1;
      break;
    }
  }

  var valores = {};
  valores.CORREO = email;
  valores.ROL = rolGuardado;
  valores.ACTIVO = 'SI';
  valores.NOMBRE = nombreLimpio;
  escribirFila_(hoja, mapa, filaDestino, valores, filaDestino > hoja.getLastRow());
  hoja.getRange(filaDestino, mapa.CORREO).setNumberFormat('@');

  var avisoDrive = '';
  if (rolesNormalizados.indexOf(ROL_TALENTO_HUMANO) !== -1 ||
      rolesNormalizados.indexOf(ROL_REVISOR) !== -1) {
    try {
      carpetaPrincipal_().addViewer(email);
    } catch (e) {
      avisoDrive = ' Revise manualmente su permiso de lectura en Drive.';
      console.warn('No se pudo dar acceso de lectura a Drive a ' + email + ': ' + e);
    }
  }

  SpreadsheetApp.flush();
  return 'Usuario activo con rol(es): ' + rolGuardado + '.' + avisoDrive;
}

/**
 * Configuracion administrativa opcional. Se ejecuta desde el editor o con
 * clasp y recibe seis correos; nunca se invoca desde la aplicacion web.
 */
function configurarUsuariosPrivados(talento1, talento2, talento3, revisor, consulta1, consulta2) {
  var dominio = String(leerConfiguracion_().dominioAutorizado || '').toLowerCase();
  var entradas = [
    [talento1, ROL_TALENTO_HUMANO, 'SI', 'Talento Humano 1'],
    [talento2, ROL_TALENTO_HUMANO, 'SI', 'Talento Humano 2'],
    [talento3, ROL_TALENTO_HUMANO, 'SI', 'Talento Humano 3'],
    [revisor,  ROL_REVISOR,        'SI', 'Revisor'],
    [consulta1, ROL_CONSULTA,      'SI', 'Consulta 1'],
    [consulta2, ROL_CONSULTA,      'SI', 'Consulta 2']
  ];
  var vistos = {};
  entradas.forEach(function (fila) {
    var correo = String(fila[0] || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      throw new Error('Hay un correo vacío o no válido en la configuración de usuarios.');
    }
    if (dominio && correo.slice(-(dominio.length + 1)) !== '@' + dominio) {
      throw new Error('El correo ' + correo + ' no pertenece al dominio institucional autorizado.');
    }
    if (vistos[correo]) throw new Error('No se puede asignar el mismo correo a dos perfiles.');
    vistos[correo] = true;
    fila[0] = correo;
  });

  prepararUsuarios();
  var hoja = hojaDe_(HOJA_USUARIOS);
  var ancho = Math.max(hoja.getLastColumn(), 4);
  if (hoja.getLastRow() > 1) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, ancho).clearContent();
  }
  hoja.getRange(2, 1, entradas.length, 4).setValues(entradas);
  hoja.getRange(2, 1, entradas.length, 1).setNumberFormat('@');

  // Solo quienes trabajan las fichas reciben lectura directa de los PDF.
  // Las cuentas de consulta permanecen limitadas al tablero de avance.
  var carpeta = carpetaPrincipal_();
  var advertencias = [];
  entradas.slice(0, 4).forEach(function (fila) {
    try {
      carpeta.addViewer(fila[0]);
    } catch (e) {
      advertencias.push(fila[0]);
      console.warn('No se pudo dar acceso de lectura a Drive a ' + fila[0] + ': ' + e);
    }
  });
  SpreadsheetApp.flush();
  return 'Usuarios configurados: 3 Talento Humano, 1 Revisor y 2 de Consulta.' +
    (advertencias.length
      ? ' Revise manualmente el permiso de lectura en Drive para: ' + advertencias.join(', ') + '.'
      : ' Talento Humano y Revisor tienen lectura de la carpeta de soportes.');
}

/** Normaliza uno o varios roles separados por coma, punto y coma o barra. */
function normalizarRolesUsuario_(valor) {
  var permitidos = [ROL_TALENTO_HUMANO, ROL_REVISOR, ROL_CONSULTA];
  var vistos = {};
  var resultado = [];

  String(valor || '').split(/[,;|]/).forEach(function (parte) {
    var rol = normalizarEncabezado_(parte);
    if (!rol) return;
    if (permitidos.indexOf(rol) === -1) {
      throw new Error('El rol indicado no es válido: ' + parte + '.');
    }
    if (!vistos[rol]) {
      vistos[rol] = true;
      resultado.push(rol);
    }
  });

  if (!resultado.length) throw new Error('Debe indicar al menos un rol válido.');
  return resultado;
}

/** Autoriza la identidad y selecciona solo uno de sus roles permitidos. */
function autorizarUsuario_(identidad, rolSolicitado) {
  var hoja = libro_().getSheetByName(HOJA_USUARIOS);
  if (!hoja || hoja.getLastRow() < 2) {
    throw new Error('El control de acceso aún no está configurado. Avise al administrador.');
  }

  var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
  var mapa = mapaEncabezados_(datos[0]);
  exigirColumnas_(mapa, ['CORREO', 'ROL', 'ACTIVO'], HOJA_USUARIOS);

  var correoBuscado = String(identidad.correo || '').trim().toLowerCase();
  for (var i = 1; i < datos.length; i++) {
    var correo = texto_(datos[i][mapa.CORREO - 1]).toLowerCase();
    if (!correo || correo !== correoBuscado) continue;

    var activo = texto_(datos[i][mapa.ACTIVO - 1]).toUpperCase();
    if (activo !== 'SI' && activo !== 'SÍ' && activo !== 'TRUE' && activo !== '1') {
      throw new Error('Su acceso a esta aplicación está desactivado.');
    }

    var roles;
    try {
      roles = normalizarRolesUsuario_(datos[i][mapa.ROL - 1]);
    } catch (e) {
      throw new Error('Su cuenta tiene un rol no reconocido. Avise al administrador.');
    }

    var solicitado = normalizarEncabezado_(rolSolicitado);
    var rol = solicitado || roles[0];
    if (roles.indexOf(rol) === -1) {
      throw new Error('El rol seleccionado no está autorizado para su cuenta.');
    }

    return {
      correo: correoBuscado,
      nombre: identidad.nombre || correoBuscado,
      rol: rol,
      roles: roles
    };
  }

  throw new Error('Su cuenta institucional no está autorizada para acceder a esta aplicación.');
}

function exigirRol_(identidad, roles) {
  if (!identidad || roles.indexOf(identidad.rol) === -1) {
    throw new Error('No tiene permiso para realizar esta acción.');
  }
}

/** Zona oficial para todas las fechas operativas de la auditoria. */
var ZONA_HORARIA_COLOMBIA = 'America/Bogota';

function zonaHoraria_() {
  return ZONA_HORARIA_COLOMBIA;
}

/* ============================================================
   ENCABEZADOS
   ============================================================ */

/**
 * Reduce un encabezado a una forma comparable: sin tildes, en mayusculas
 * y con guion bajo en lugar de espacios. Asi "Núm. Documento" y
 * "NUM_DOCUMENTO" se reconocen como la misma columna.
 */
function normalizarEncabezado_(valor) {
  return String(valor == null ? '' : valor)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Devuelve { ENCABEZADO_NORMALIZADO: numeroDeColumna }. */
function mapaEncabezados_(fila) {
  var mapa = {};
  fila.forEach(function (celda, i) {
    var clave = normalizarEncabezado_(celda);
    if (clave && !mapa[clave]) mapa[clave] = i + 1;
  });
  return mapa;
}

/** Exige que existan las columnas indicadas y avisa con claridad si faltan. */
function exigirColumnas_(mapa, nombres, hoja) {
  var faltan = nombres.filter(function (n) { return !mapa[n]; });
  if (faltan.length) {
    throw new Error('A la hoja "' + hoja + '" le faltan estas columnas: ' + faltan.join(', ') + '.');
  }
}

/* ============================================================
   UTILIDADES DE VALOR
   ============================================================ */

/** Convierte cualquier celda en un texto limpio y presentable. */
function texto_(valor) {
  if (valor === null || valor === undefined) return '';
  if (valor instanceof Date) return formatearFecha_(valor);
  if (typeof valor === 'number') return String(valor);
  return String(valor).trim();
}

function formatearFecha_(fecha) {
  if (!(fecha instanceof Date) || isNaN(fecha.getTime())) return '';
  return Utilities.formatDate(fecha, zonaHoraria_(), 'dd/MM/yyyy');
}

function formatearFechaHora_(fecha) {
  if (!(fecha instanceof Date) || isNaN(fecha.getTime())) return '';
  return Utilities.formatDate(fecha, zonaHoraria_(), 'dd/MM/yyyy HH:mm');
}

/**
 * Las marcas de tiempo se guardan como texto, pero si alguien reescribe la
 * celda Sheets puede convertirla en fecha. Esto acepta ambas formas.
 */
function textoFechaHora_(valor) {
  if (valor instanceof Date) return formatearFechaHora_(valor);
  return texto_(valor);
}

/** Documento tal como se muestra: sin espacios sobrantes ni decimales. */
function normalizarDocumento_(valor) {
  if (typeof valor === 'number') return String(Math.round(valor));
  return String(valor == null ? '' : valor).trim();
}

/** Forma usada solo para comparar: ignora puntos, espacios y guiones. */
function claveDocumento_(valor) {
  return normalizarDocumento_(valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Recorta y limpia un texto que llega del navegador. */
function textoEntrante_(valor, maximo) {
  var t = String(valor == null ? '' : valor).replace(/[ \t]+/g, ' ').trim();
  return maximo && t.length > maximo ? t.slice(0, maximo) : t;
}

/**
 * Acepta la fecha del control HTML (aaaa-mm-dd) y el formato historico de
 * la hoja (dd/mm/aaaa). Comprueba que sea una fecha real y devuelve siempre
 * dd/mm/aaaa para mantener uniforme la columna de correcciones.
 */
function normalizarFechaCorreccion_(valor, etiqueta) {
  var texto = String(valor || '').trim();
  var partes;
  var dia;
  var mes;
  var anio;

  if ((partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto))) {
    anio = Number(partes[1]);
    mes  = Number(partes[2]);
    dia  = Number(partes[3]);
  } else if ((partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto))) {
    dia  = Number(partes[1]);
    mes  = Number(partes[2]);
    anio = Number(partes[3]);
  } else {
    throw new Error('Indique una fecha válida para "' + etiqueta + '".');
  }

  var fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 ||
      fecha.getUTCDate() !== dia) {
    throw new Error('Indique una fecha válida para "' + etiqueta + '".');
  }

  var dos = function (numero) { return numero < 10 ? '0' + numero : String(numero); };
  return dos(dia) + '/' + dos(mes) + '/' + anio;
}

/** Convierte una fecha de hoja o control HTML en un Date comparable. */
function fechaOperativa_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  var texto = String(valor || '').trim();
  var partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (partes) {
    return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  }
  partes = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(texto);
  if (!partes) return null;
  return new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]),
    Number(partes[4] || 0), Number(partes[5] || 0));
}

/** Fecha de Colombia sin hora, usada para habilitar la radicacion. */
function hoyColombia_() {
  var partes = Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyy-MM-dd').split('-');
  return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
}

/** Estado MEN visible; una subsanacion vencida queda lista automaticamente. */
function estadoMenEfectivo_(estado, disponible, radicado) {
  if (radicado) return MEN_RADICADO;
  var normalizado = String(estado || '').trim().toUpperCase();
  if (normalizado === MEN_SUBSANACION) {
    var fecha = fechaOperativa_(disponible);
    if (fecha && fecha.getTime() <= hoyColombia_().getTime()) return MEN_LISTO;
    return MEN_SUBSANACION;
  }
  if (normalizado === MEN_LISTO) return MEN_LISTO;
  return MEN_PENDIENTE;
}

/* ============================================================
   CONFIGURACION
   ============================================================ */

/**
 * Lee la hoja Configuracion (PARAMETRO / VALOR).
 *
 * CARPETA_ACTAS_OBLIGATORIA es el interruptor que decide si el acta de
 * grado es indispensable para guardar; se acepta tambien el nombre
 * ACTA_OBLIGATORIA por si algun dia se renombra el parametro.
 */
function leerConfiguracion_() {
  var hoja = hojaDe_(HOJA_CONFIG);
  var bruto = {};

  if (hoja.getLastRow() >= 2 && hoja.getLastColumn() >= 2) {
    hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues().forEach(function (fila) {
      var clave = normalizarEncabezado_(fila[0]);
      if (clave) bruto[clave] = texto_(fila[1]);
    });
  }

  var si = function (valor, porDefecto) {
    var v = String(valor == null ? '' : valor).trim().toUpperCase();
    if (v === 'SI' || v === 'SÍ' || v === 'TRUE' || v === 'X' || v === '1') return true;
    if (v === 'NO' || v === 'FALSE' || v === '0') return false;
    return porDefecto;
  };

  var acta = bruto.CARPETA_ACTAS_OBLIGATORIA;
  if (acta === undefined) acta = bruto.ACTA_OBLIGATORIA;

  return {
    nombreAuditoria: bruto.NOMBRE_AUDITORIA || 'Auditoría documental de docentes',
    idCarpeta: bruto.ID_CARPETA_PRINCIPAL_DRIVE || '',
    actaObligatoria: si(acta, true),
    diplomaObligatorio: si(bruto.DIPLOMA_OBLIGATORIO, false),

    // Control de acceso. Ver Api.gs.
    idClienteOauth: bruto.ID_CLIENTE_OAUTH || '',
    dominioAutorizado: bruto.DOMINIO_AUTORIZADO || '',
    urlSitio: bruto.URL_SITIO || ''
  };
}

/* ============================================================
   DOCENTES  (solo lectura, jamas se escribe)
   ============================================================ */

/**
 * Devuelve la lista completa de docentes con sus valores reportados, ya
 * indexados por la clave de cada criterio.
 */
function leerDocentes_() {
  var hoja = hojaDe_(HOJA_DOCENTES);
  if (hoja.getLastRow() < 2) return [];

  var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
  var mapa = mapaEncabezados_(datos[0]);

  exigirColumnas_(mapa, ['NUM_DOCUMENTO', 'PRIMER_NOMBRE', 'PRIMER_APELLIDO'], HOJA_DOCENTES);

  var celda = function (fila, encabezado) {
    var col = mapa[encabezado];
    return col ? fila[col - 1] : '';
  };

  var vistos = {};
  var docentes = [];

  for (var i = 1; i < datos.length; i++) {
    var fila = datos[i];
    var documento = normalizarDocumento_(celda(fila, 'NUM_DOCUMENTO'));
    if (!documento) continue;

    var clave = claveDocumento_(documento);
    if (vistos[clave]) continue;   // la primera fila de cada docente manda
    vistos[clave] = true;

    var valores = {};
    CRITERIOS.forEach(function (c) {
      valores[c.clave] = texto_(celda(fila, c.campo));
    });
    valores.NUM_DOCUMENTO = documento;

    var partes = [
      texto_(celda(fila, 'PRIMER_NOMBRE')),
      texto_(celda(fila, 'SEGUNDO_NOMBRE')),
      texto_(celda(fila, 'PRIMER_APELLIDO')),
      texto_(celda(fila, 'SEGUNDO_APELLIDO'))
    ].filter(function (p) { return p !== ''; });

    docentes.push({
      documento: documento,
      clave: clave,
      tipoDocumento: texto_(celda(fila, 'ID_TIPO_DOCUMENTO')) || 'CC',
      nombreCompleto: partes.join(' '),
      valores: valores
    });
  }

  return docentes;
}

function buscarDocente_(documento) {
  var clave = claveDocumento_(documento);
  if (!clave) return null;
  var lista = leerDocentes_();
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].clave === clave) return lista[i];
  }
  return null;
}

/* ============================================================
   VALIDACIONES
   ============================================================ */

/**
 * Devuelve la hoja Validaciones, creandola con sus encabezados si no
 * existe y agregando al final las columnas que falten. Nunca borra ni
 * reordena lo que ya haya.
 */
function hojaValidaciones_() {
  var libro = libro_();
  var hoja = libro.getSheetByName(HOJA_VALIDACIONES);
  var esperados = encabezadosValidaciones_();

  if (!hoja) {
    hoja = libro.insertSheet(HOJA_VALIDACIONES);
    hoja.getRange(1, 1, 1, esperados.length).setValues([esperados]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    // El documento es un identificador, no una cifra: se guarda como texto
    // para no perder ceros a la izquierda.
    hoja.getRange(2, 1, hoja.getMaxRows() - 1, 1).setNumberFormat('@');
    return hoja;
  }

  if (hoja.getLastRow() === 0 || hoja.getLastColumn() === 0) {
    hoja.getRange(1, 1, 1, esperados.length).setValues([esperados]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    return hoja;
  }

  var actuales = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var mapa = mapaEncabezados_(actuales);
  var faltantes = esperados.filter(function (e) { return !mapa[normalizarEncabezado_(e)]; });

  if (faltantes.length) {
    hoja.getRange(1, hoja.getLastColumn() + 1, 1, faltantes.length)
        .setValues([faltantes]).setFontWeight('bold');
  }

  return hoja;
}

/**
 * Lee la hoja Validaciones completa y la entrega indexada por documento.
 * Cada entrada trae el numero de fila para poder actualizarla despues.
 */
function leerValidaciones_() {
  var hoja = hojaValidaciones_();
  var indice = {};
  if (hoja.getLastRow() < 2) return indice;

  var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
  var mapa = mapaEncabezados_(datos[0]);
  if (!mapa.NUM_DOCUMENTO) return indice;

  for (var i = 1; i < datos.length; i++) {
    var documento = normalizarDocumento_(datos[i][mapa.NUM_DOCUMENTO - 1]);
    if (!documento) continue;
    var clave = claveDocumento_(documento);
    // Si por accidente hubiera dos filas del mismo docente, manda la primera:
    // es la que se seguira actualizando y la que evita crear duplicados.
    if (indice[clave]) continue;
    indice[clave] = { fila: i + 1, datos: datos[i], mapa: mapa };
  }
  return indice;
}

/** Convierte una fila cruda de Validaciones en el objeto que usa la pagina. */
function armarValidacion_(registro) {
  var mapa = registro.mapa;
  var fila = registro.datos;
  var leer = function (encabezado) {
    var col = mapa[encabezado];
    return col ? fila[col - 1] : '';
  };

  var criterios = {};
  var revisionCriterios = {};
  var revisionCorrecciones = {};
  CRITERIOS.forEach(function (c) {
    var valor = texto_(leer('VAL_' + c.clave)).toUpperCase();
    criterios[c.clave] = {
      valor: (valor === COINCIDE || valor === NO_COINCIDE) ? valor : '',
      correccion: texto_(leer('CORR_' + c.clave))
    };
    var revision = texto_(leer('REV_' + c.clave)).toUpperCase();
    revisionCriterios[c.clave] =
      (revision === REV_CONFORME || revision === REV_NO_CONFORME) ? revision : '';
    revisionCorrecciones[c.clave] = texto_(leer('REV_CORR_' + c.clave));
  });

  var estado = texto_(leer('ESTADO')).toUpperCase();
  if (estado !== ESTADO_VALIDADO && estado !== ESTADO_CORRECCION) {
    estado = calcularEstado_(criterios);
  }

  var estadoRevision = texto_(leer('ESTADO_REVISION')).toUpperCase();
  if ([REV_POR_ENVIAR, REV_EN_REVISION, REV_DEVUELTO, REV_APROBADO]
      .indexOf(estadoRevision) === -1) {
    // Migracion segura: una validacion antigua existe, pero nadie la ha
    // enviado formalmente al nuevo flujo de aprobacion.
    estadoRevision = REV_POR_ENVIAR;
  }

  var version = Number(leer('VERSION'));
  if (!isFinite(version) || version < 1) version = 1;

  var radicadoMen = texto_(leer('RADICADO_MEN')).toUpperCase();
  var esRadicadoMen = radicadoMen === 'SI' || radicadoMen === 'SÍ' ||
    radicadoMen === 'TRUE' || radicadoMen === '1';
  var fechaDisponibleRadicacion = textoFechaHora_(leer('FECHA_DISPONIBLE_RADICACION'));
  var estadoMen = estadoMenEfectivo_(
    texto_(leer('ESTADO_MEN')), fechaDisponibleRadicacion, esRadicadoMen);

  return {
    criterios: criterios,
    observaciones: texto_(leer('OBSERVACIONES')),
    idCarpeta: texto_(leer('ID_CARPETA_DOCENTE')),
    urlCarpeta: texto_(leer('URL_CARPETA_DOCENTE')),
    idActa: texto_(leer('ID_ACTA')),
    urlActa: texto_(leer('URL_ACTA')),
    idDiploma: texto_(leer('ID_DIPLOMA')),
    urlDiploma: texto_(leer('URL_DIPLOMA')),
    fechaValidacion: textoFechaHora_(leer('FECHA_VALIDACION')),
    fechaModificacion: textoFechaHora_(leer('FECHA_MODIFICACION')),
    estado: estado,
    estadoRevision: estadoRevision,
    version: Math.floor(version),
    guardadoPor: texto_(leer('GUARDADO_POR')),
    enviadoPor: texto_(leer('ENVIADO_POR')),
    fechaEnvio: textoFechaHora_(leer('FECHA_ENVIO')),
    revisadoPor: texto_(leer('REVISADO_POR')),
    fechaRevision: textoFechaHora_(leer('FECHA_REVISION')),
    decisionRevision: texto_(leer('DECISION_REVISION')).toUpperCase(),
    observacionRevision: texto_(leer('OBSERVACION_REVISION')),
    estadoMen: estadoMen,
    motivoSubsanacion: texto_(leer('MOTIVO_SUBSANACION')),
    fechaSubsanacion: textoFechaHora_(leer('FECHA_SUBSANACION')),
    fechaDisponibleRadicacion: fechaDisponibleRadicacion,
    subsanacionPor: texto_(leer('SUBSANACION_POR')),
    radicadoMen: esRadicadoMen,
    radicadoPor: texto_(leer('RADICADO_POR')),
    fechaRadicacionMen: textoFechaHora_(leer('FECHA_RADICACION_MEN')),
    revisionCriterios: revisionCriterios,
    revisionCorrecciones: revisionCorrecciones
  };
}

function urlPrevisualizacion_(id) {
  return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : '';
}

/**
 * Version de la revision apta para viajar al navegador.
 *
 * Los identificadores de Drive se quedan en el servidor: la ficha solo
 * necesita las URL para abrir los documentos, y un identificador suelto
 * en el cliente no aporta nada y si amplia lo que queda expuesto.
 */
function sinIdentificadores_(validacion) {
  if (!validacion) return null;
  return {
    criterios: validacion.criterios,
    observaciones: validacion.observaciones,
    urlCarpeta: validacion.urlCarpeta,
    urlActa: validacion.urlActa,
    urlDiploma: validacion.urlDiploma,
    previewActa: urlPrevisualizacion_(validacion.idActa),
    previewDiploma: urlPrevisualizacion_(validacion.idDiploma),
    fechaValidacion: validacion.fechaValidacion,
    fechaModificacion: validacion.fechaModificacion,
    estado: validacion.estado,
    estadoRevision: validacion.estadoRevision,
    version: validacion.version,
    guardadoPor: validacion.guardadoPor,
    enviadoPor: validacion.enviadoPor,
    fechaEnvio: validacion.fechaEnvio,
    revisadoPor: validacion.revisadoPor,
    fechaRevision: validacion.fechaRevision,
    decisionRevision: validacion.decisionRevision,
    observacionRevision: validacion.observacionRevision,
    estadoMen: validacion.estadoMen,
    motivoSubsanacion: validacion.motivoSubsanacion,
    fechaSubsanacion: validacion.fechaSubsanacion,
    fechaDisponibleRadicacion: validacion.fechaDisponibleRadicacion,
    subsanacionPor: validacion.subsanacionPor,
    radicadoMen: validacion.radicadoMen,
    radicadoPor: validacion.radicadoPor,
    fechaRadicacionMen: validacion.fechaRadicacionMen,
    revisionCriterios: validacion.revisionCriterios,
    revisionCorrecciones: validacion.revisionCorrecciones
  };
}

/** VALIDADO si los diez criterios coinciden; si no, REQUIERE_CORRECCION. */
function calcularEstado_(criterios) {
  for (var i = 0; i < CRITERIOS.length; i++) {
    var c = criterios[CRITERIOS[i].clave];
    if (c && c.valor === NO_COINCIDE) return ESTADO_CORRECCION;
  }
  return ESTADO_VALIDADO;
}

/* ============================================================
   DRIVE
   ============================================================ */

function carpetaPrincipal_() {
  var id = leerConfiguracion_().idCarpeta;
  if (!id) {
    throw new Error('Falta el parámetro ID_CARPETA_PRINCIPAL_DRIVE en la hoja Configuracion.');
  }
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error('No fue posible abrir la carpeta principal de Drive. ' +
      'Verifique ID_CARPETA_PRINCIPAL_DRIVE y que la cuenta tenga acceso a ella.');
  }
}

/**
 * Recorre una sola vez las subcarpetas de la carpeta principal y las deja
 * indexadas por el numero de documento con que empieza su nombre.
 *
 * Se hace una sola pasada porque recorrer Drive es lo caro: preguntar por
 * cada docente serian cincuenta recorridos en lugar de uno.
 */
function indiceCarpetas_(principal) {
  var porNumero = {};
  var todas = [];

  var hijas = principal.getFolders();
  while (hijas.hasNext()) {
    var carpeta = hijas.next();
    var nombre = String(carpeta.getName()).trim();
    todas.push({ nombre: nombre, carpeta: carpeta });

    // "DOC-EJ-001 - DOCENTE EJEMPLO" y "DOC-EJ-001-DOCENTE EJEMPLO"
    // dan lo mismo.
    var inicial = claveDocumento_(nombre.split('-')[0]);
    if (inicial && !porNumero[inicial]) porNumero[inicial] = carpeta;
  }

  return { porNumero: porNumero, todas: todas };
}

/**
 * Busca la carpeta de un docente dentro del indice.
 *
 * Primero por el numero con que empieza el nombre, que es el patron que
 * usa la aplicacion. Si no aparece, se revisa si el numero figura como
 * una palabra suelta en cualquier posicion, para reconocer carpetas
 * nombradas al reves ("DOCENTE EJEMPLO - DOC-EJ-001"). Se compara la clave
 * completa, nunca por coincidencia parcial, para no asociar documentos
 * distintos por accidente.
 */
function buscarCarpeta_(indice, documento) {
  var clave = claveDocumento_(documento);
  if (!clave) return null;
  if (indice.porNumero[clave]) return indice.porNumero[clave];

  for (var i = 0; i < indice.todas.length; i++) {
    var trozos = indice.todas[i].nombre.split(/[^0-9A-Za-z]+/);
    for (var j = 0; j < trozos.length; j++) {
      if (trozos[j] && claveDocumento_(trozos[j]) === clave) {
        return indice.todas[i].carpeta;
      }
    }
  }
  return null;
}

/**
 * Carpeta individual del docente: "DOC-EJ-001 - DOCENTE EJEMPLO".
 *
 * Si ya existe NO se crea otra, ni siquiera si alguien la renombro. Solo
 * se crea cuando de verdad no hay ninguna.
 *
 * El indice es opcional: quien vaya a resolver muchas carpetas seguidas
 * lo construye una vez y lo reutiliza.
 */
function carpetaDocente_(docente, indice) {
  var principal = carpetaPrincipal_();
  var idx = indice || indiceCarpetas_(principal);

  var existente = buscarCarpeta_(idx, docente.documento);
  if (existente) return existente;

  return principal.createFolder(nombreCarpeta_(docente));
}

/**
 * Nombre canonico de la carpeta de un docente.
 *
 * Los espacios repetidos se colapsan: algunos nombres vienen de la hoja
 * con doble espacio ("LILIANA DEL  PILAR") y en Drive eso es un nombre
 * incomodo de leer y de buscar. Ojo: esto SOLO se aplica al nombre de la
 * carpeta. Los valores que la ficha muestra para comparar contra SNIES se
 * dejan tal cual estan reportados, porque ahi el auditor debe ver el dato
 * exacto, espacios incluidos.
 */
function nombreCarpeta_(docente) {
  var nombre = String(docente.nombreCompleto || '').replace(/\s+/g, ' ').trim();
  return docente.documento + ' - ' + nombre;
}

/** Nombre legible y único para cada soporte vigente en Drive. */
function nombreSoporte_(docente, tipo) {
  var documento = String(docente.documento || '').replace(/[\\/:*?"<>|]/g, '-').trim();
  var nombre = String(docente.nombreCompleto || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  var clase = tipo === 'diploma' ? 'DIPLOMA DE GRADO' : 'ACTA DE GRADO';
  return documento + '-' + nombre + '-' + clase + '.pdf';
}

/**
 * Comprueba que lo recibido sea de verdad un PDF antes de tocar Drive:
 * extension, tipo declarado, tamano y firma "%PDF-" al inicio del archivo.
 * Devuelve el blob listo para guardar.
 */
function blobPdf_(archivo, etiqueta, nombreDestino) {
  if (!archivo || typeof archivo.datos !== 'string' || !archivo.datos) {
    throw new Error('El archivo de ' + etiqueta + ' llegó vacío. Vuelva a seleccionarlo.');
  }

  var nombre = String(archivo.nombre || '');
  if (!/\.pdf$/i.test(nombre)) {
    throw new Error('El ' + etiqueta + ' debe ser un archivo PDF.');
  }
  if (archivo.tipo && String(archivo.tipo).toLowerCase() !== 'application/pdf') {
    throw new Error('El ' + etiqueta + ' debe ser un archivo PDF.');
  }

  var bytes;
  try {
    bytes = Utilities.base64Decode(archivo.datos);
  } catch (e) {
    throw new Error('No fue posible leer el archivo de ' + etiqueta + '. Vuelva a seleccionarlo.');
  }

  if (!bytes.length) {
    throw new Error('El archivo de ' + etiqueta + ' está vacío.');
  }
  if (bytes.length > MAX_BYTES_PDF) {
    throw new Error('El ' + etiqueta + ' supera el tamaño máximo de ' +
      Math.round(MAX_BYTES_PDF / (1024 * 1024)) + ' MB.');
  }

  // Firma de un PDF: %PDF-
  var firma = [0x25, 0x50, 0x44, 0x46, 0x2D];
  for (var i = 0; i < firma.length; i++) {
    if ((bytes[i] & 0xFF) !== firma[i]) {
      throw new Error('El archivo de ' + etiqueta + ' no es un PDF válido.');
    }
  }

  return Utilities.newBlob(bytes, 'application/pdf', nombreDestino);
}

/**
 * Guarda el PDF con el nombre estandarizado dentro de la carpeta del
 * docente. Si ya habia un archivo con ese nombre, el nuevo se crea primero
 * y el anterior se archiva en la subcarpeta HISTORIAL_DOCUMENTOS. Asi el
 * revisor ve una sola version vigente, pero la trazabilidad no se pierde.
 *
 * Es tambien lo que evita los "01_ACTA_GRADO (1).pdf": Drive solo agrega
 * ese sufijo cuando conviven dos archivos con el mismo nombre, y aqui el
 * anterior desaparece en cuanto el nuevo esta a salvo.
 *
 * Devuelve { id, url } del archivo vigente.
 */
function guardarPdf_(carpeta, blob, nombreDestino, nombresCompatibles) {
  var previos = [];
  var vistos = {};
  [nombreDestino].concat(nombresCompatibles || []).forEach(function (nombreBuscado) {
    var existentes = carpeta.getFilesByName(nombreBuscado);
    while (existentes.hasNext()) {
      var archivo = existentes.next();
      if (!vistos[archivo.getId()]) {
        vistos[archivo.getId()] = true;
        previos.push(archivo);
      }
    }
  });

  var nuevo = carpeta.createFile(blob);
  nuevo.setName(nombreDestino);

  var historial = null;
  if (previos.length) {
    var carpetas = carpeta.getFoldersByName('HISTORIAL_DOCUMENTOS');
    historial = carpetas.hasNext() ? carpetas.next() : carpeta.createFolder('HISTORIAL_DOCUMENTOS');
  }
  var marca = Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyyMMdd_HHmmss');
  previos.forEach(function (archivo, indice) {
    try {
      var base = nombreDestino.replace(/\.pdf$/i, '');
      archivo.setName(base + '_' + marca + (indice ? '_' + (indice + 1) : '') + '.pdf');
      archivo.moveTo(historial);
    } catch (e) {
      console.warn('No se pudo archivar la versión anterior de ' + nombreDestino + ': ' + e);
    }
  });

  return { id: nuevo.getId(), url: nuevo.getUrl() };
}

/** Retira el soporte vigente y lo conserva en el historial documental. */
function retirarPdf_(carpeta, nombreDestino, nombresCompatibles) {
  var carpetas = carpeta.getFoldersByName('HISTORIAL_DOCUMENTOS');
  var historial = carpetas.hasNext() ? carpetas.next() : carpeta.createFolder('HISTORIAL_DOCUMENTOS');
  var marca = Utilities.formatDate(new Date(), zonaHoraria_(), 'yyyyMMdd_HHmmss');
  var indice = 0;
  var vistos = {};
  [nombreDestino].concat(nombresCompatibles || []).forEach(function (nombreBuscado) {
    var existentes = carpeta.getFilesByName(nombreBuscado);
    while (existentes.hasNext()) {
      try {
        var archivo = existentes.next();
        if (vistos[archivo.getId()]) continue;
        vistos[archivo.getId()] = true;
        var base = nombreDestino.replace(/\.pdf$/i, '');
        archivo.setName(base + '_RETIRADO_' + marca + (indice ? '_' + (indice + 1) : '') + '.pdf');
        archivo.moveTo(historial);
        indice++;
      } catch (e) {
        console.warn('No se pudo retirar ' + nombreBuscado + ': ' + e);
      }
    }
  });
}

/* ============================================================
   RESUMEN
   ============================================================ */

function resumirEstados_(lista) {
  var resumen = {
    total: lista.length,
    pendientesCarga: 0,
    porEnviar: 0,
    enRevision: 0,
    devueltos: 0,
    aprobados: 0,
    menPendientes: 0,
    menSubsanacion: 0,
    menListos: 0,
    menRadicados: 0
  };
  lista.forEach(function (d) {
    if (d.tieneValidacion === false) resumen.pendientesCarga++;
    else if (d.estadoRevision === REV_EN_REVISION) resumen.enRevision++;
    else if (d.estadoRevision === REV_DEVUELTO) resumen.devueltos++;
    else if (d.estadoRevision === REV_APROBADO) {
      resumen.aprobados++;
      if (d.estadoMen === MEN_RADICADO || d.radicadoMen) resumen.menRadicados++;
      else if (d.estadoMen === MEN_SUBSANACION) resumen.menSubsanacion++;
      else if (d.estadoMen === MEN_LISTO) resumen.menListos++;
      else resumen.menPendientes++;
    }
    else resumen.porEnviar++;
  });
  return resumen;
}

/** Estado de un docente a partir del indice de validaciones. */
function estadoDesdeIndice_(indice, clave) {
  var registro = indice[clave];
  if (!registro) return ESTADO_PENDIENTE;
  return armarValidacion_(registro).estado === ESTADO_CORRECCION
    ? ESTADO_CORRECCION
    : ESTADO_VALIDADO;
}

function estadoRevisionDesdeIndice_(indice, clave) {
  var registro = indice[clave];
  return registro ? armarValidacion_(registro).estadoRevision : REV_POR_ENVIAR;
}

/* ============================================================
   ACCIONES PUBLICAS
   ============================================================ */

/**
 * Todo lo que la pagina necesita para dibujar el tablero: el nombre de la
 * auditoria, los diez criterios, los requisitos documentales, la lista de
 * docentes con su estado y el conteo de las cuatro tarjetas.
 *
 * Deliberadamente NO viaja el identificador de la carpeta de Drive ni
 * ningun otro dato de configuracion interna.
 */
function obtenerDocentes(identidad) {
  try {
    exigirRol_(identidad, [ROL_TALENTO_HUMANO, ROL_REVISOR, ROL_CONSULTA]);
    var configuracion = leerConfiguracion_();
    var docentes = leerDocentes_();
    var indice = leerValidaciones_();

    var lista = docentes.map(function (d) {
      var tieneValidacion = !!indice[d.clave];
      var validacion = tieneValidacion ? armarValidacion_(indice[d.clave]) : null;
      return {
        documento: d.documento,
        tipoDocumento: d.tipoDocumento,
        nombreCompleto: d.nombreCompleto,
        tieneValidacion: tieneValidacion,
        // Consulta ve el avance, no el detalle academico de cada ficha.
        valores: identidad.rol === ROL_CONSULTA ? {} : d.valores,
        estado: validacion ? validacion.estado : ESTADO_PENDIENTE,
        estadoRevision: validacion ? validacion.estadoRevision : REV_POR_ENVIAR,
        version: validacion ? validacion.version : 0,
        guardadoPor: validacion ? validacion.guardadoPor : '',
        fechaModificacion: validacion ? validacion.fechaModificacion : '',
        enviadoPor: validacion ? validacion.enviadoPor : '',
        fechaEnvio: validacion ? validacion.fechaEnvio : '',
        revisadoPor: validacion ? validacion.revisadoPor : '',
        fechaRevision: validacion ? validacion.fechaRevision : '',
        estadoMen: validacion ? validacion.estadoMen : MEN_PENDIENTE,
        motivoSubsanacion: validacion ? validacion.motivoSubsanacion : '',
        fechaSubsanacion: validacion ? validacion.fechaSubsanacion : '',
        fechaDisponibleRadicacion: validacion ? validacion.fechaDisponibleRadicacion : '',
        subsanacionPor: validacion ? validacion.subsanacionPor : '',
        radicadoMen: validacion ? validacion.radicadoMen : false,
        radicadoPor: validacion ? validacion.radicadoPor : '',
        fechaRadicacionMen: validacion ? validacion.fechaRadicacionMen : ''
      };
    });

    return {
      auditoria: configuracion.nombreAuditoria,
      criterios: CRITERIOS.map(function (c) {
      return {
        clave: c.clave,
        etiqueta: c.etiqueta,
        opcionesCorreccion: c.opcionesCorreccion || [],
        tipoCorreccion: c.tipoCorreccion || 'texto',
        normalizarCorreccion: c.normalizarCorreccion || ''
      };
      }),
      requisitos: {
        actaObligatoria: configuracion.actaObligatoria,
        diplomaObligatorio: configuracion.diplomaObligatorio
      },
      perfil: {
        correo: identidad.correo,
        nombre: identidad.nombre,
        rol: identidad.rol,
        roles: identidad.roles || [identidad.rol]
      },
      docentes: lista,
      resumen: resumirEstados_(lista)
    };
  } catch (e) {
    console.error('obtenerDocentes: ' + (e && e.stack ? e.stack : e));
    throw new Error(e && e.message ? e.message : 'No fue posible cargar la lista de docentes.');
  }
}

/**
 * Revision guardada de un docente.
 *
 * Responde SIEMPRE con un objeto completo. Si el docente aun no ha sido
 * revisado devuelve { existe: false, validacion: null } en lugar de
 * fallar: la pagina no necesita distinguir un error de una revision que
 * todavia no existe.
 */
function obtenerValidacion(documento, identidad) {
  var buscado = normalizarDocumento_(documento);
  try {
    exigirRol_(identidad, [ROL_TALENTO_HUMANO, ROL_REVISOR]);
    if (!buscado) throw new Error('No se indicó el documento del docente.');

    var docente = buscarDocente_(buscado);
    if (!docente) {
      throw new Error('El docente con documento ' + buscado + ' no figura en la hoja Docentes.');
    }

    var registro = leerValidaciones_()[docente.clave];
    var validacion = registro ? armarValidacion_(registro) : null;

    return {
      existe: !!registro,
      docente: {
        documento: docente.documento,
        tipoDocumento: docente.tipoDocumento,
        nombreCompleto: docente.nombreCompleto,
        valores: docente.valores
      },
      validacion: sinIdentificadores_(validacion),
      estado: validacion ? validacion.estado : ESTADO_PENDIENTE,
      estadoRevision: validacion ? validacion.estadoRevision : REV_POR_ENVIAR,
      perfil: {
        correo: identidad.correo,
        nombre: identidad.nombre,
        rol: identidad.rol,
        roles: identidad.roles || [identidad.rol]
      }
    };
  } catch (e) {
    console.error('obtenerValidacion(' + buscado + '): ' + (e && e.stack ? e.stack : e));
    throw new Error(e && e.message ? e.message : 'No fue posible cargar la revisión.');
  }
}

/**
 * Registra o actualiza la revision de un docente.
 *
 * El navegador ya valida, pero aqui se vuelve a validar todo desde cero:
 * es el servidor quien decide si una revision es aceptable.
 *
 * payload = {
 *   documento, observaciones,
 *   criterios: { CLAVE: { valor: 'COINCIDE'|'NO_COINCIDE', correccion } },
 *   acta:    { nombre, tipo, datos } | null,
 *   diploma: { nombre, tipo, datos } | null,
 *   quitarDiploma: boolean
 * }
 */
function guardarValidacion(payload, identidad) {
  var candado = LockService.getScriptLock();
  try {
    // Dos guardados simultaneos sobre el mismo docente crearian dos filas.
    candado.waitLock(30000);
  } catch (e) {
    throw new Error('El sistema está atendiendo otra revisión. Intente de nuevo en unos segundos.');
  }

  try {
    exigirRol_(identidad, [ROL_TALENTO_HUMANO]);
    if (!payload || typeof payload !== 'object') {
      throw new Error('No se recibió información de la revisión.');
    }

    var configuracion = leerConfiguracion_();
    var documento = normalizarDocumento_(payload.documento);
    var docente = buscarDocente_(documento);
    if (!docente) {
      throw new Error('El docente con documento ' + documento + ' no figura en la hoja Docentes.');
    }

    /* --- 1. Criterios ------------------------------------------------ */
    var entrantes = (payload.criterios && typeof payload.criterios === 'object') ? payload.criterios : {};
    var criterios = {};

    CRITERIOS.forEach(function (c) {
      var recibido = entrantes[c.clave] || {};
      var valor = String(recibido.valor || '').trim().toUpperCase();

      if (valor !== COINCIDE && valor !== NO_COINCIDE) {
        throw new Error('Falta revisar el criterio "' + c.etiqueta + '".');
      }

      var correccion = textoEntrante_(recibido.correccion, 500);
      if (valor === NO_COINCIDE && !correccion) {
        throw new Error('Indique el valor correcto según el soporte para "' + c.etiqueta + '".');
      }
      if (valor === NO_COINCIDE && c.normalizarCorreccion === 'mayusculas') {
        correccion = correccion.toUpperCase();
      }
      if (valor === NO_COINCIDE && c.opcionesCorreccion &&
          c.opcionesCorreccion.indexOf(correccion) === -1) {
        throw new Error('Seleccione un valor permitido para "' + c.etiqueta + '".');
      }
      if (valor === NO_COINCIDE && c.tipoCorreccion === 'fecha') {
        correccion = normalizarFechaCorreccion_(correccion, c.etiqueta);
      }
      // Una correccion solo tiene sentido cuando algo no coincide.
      if (valor === COINCIDE) correccion = '';

      criterios[c.clave] = { valor: valor, correccion: correccion };
    });

    var observaciones = textoEntrante_(payload.observaciones, 2000);
    var estado = calcularEstado_(criterios);

    /* --- 2. Soportes documentales ------------------------------------ */
    var registroPrevio = leerValidaciones_()[docente.clave];
    var previo = registroPrevio ? armarValidacion_(registroPrevio) : null;
    var versionEsperada = Number(payload.version || 0);
    var versionActual = previo ? previo.version : 0;
    if (versionEsperada !== versionActual) {
      throw new Error('Este registro cambió desde que lo abrió. Vuelva al listado y ábralo de nuevo.');
    }
    if (previo && (previo.estadoRevision === REV_EN_REVISION ||
                   previo.estadoRevision === REV_APROBADO)) {
      throw new Error('Este registro está bloqueado porque ya fue enviado a revisión.');
    }

    // Se parte de lo que ya estaba registrado y solo se cambia lo que
    // toque esta revision.
    var soportes = {
      idCarpeta:  previo ? previo.idCarpeta  : '',
      urlCarpeta: previo ? previo.urlCarpeta : '',
      idActa:     previo ? previo.idActa     : '',
      urlActa:    previo ? previo.urlActa    : '',
      idDiploma:  previo ? previo.idDiploma  : '',
      urlDiploma: previo ? previo.urlDiploma : ''
    };

    var traeActa      = !!(payload.acta && payload.acta.datos);
    var traeDiploma   = !!(payload.diploma && payload.diploma.datos);
    var quitarDiploma = payload.quitarDiploma === true;

    if (configuracion.actaObligatoria && !traeActa && !soportes.urlActa) {
      throw new Error('Debe cargar el acta de grado en formato PDF.');
    }
    if (configuracion.diplomaObligatorio && !traeDiploma &&
        (!soportes.urlDiploma || quitarDiploma)) {
      throw new Error('Debe cargar el diploma de grado en formato PDF.');
    }

    // Los blobs se arman ANTES de tocar Drive: si un archivo no es un PDF
    // valido, la revision se rechaza sin haber creado carpetas ni archivos.
    var nombreActa = nombreSoporte_(docente, 'acta');
    var nombreDiploma = nombreSoporte_(docente, 'diploma');
    var blobActa = traeActa
      ? blobPdf_(payload.acta, 'acta de grado', nombreActa) : null;
    var blobDiploma = traeDiploma
      ? blobPdf_(payload.diploma, 'diploma de grado', nombreDiploma) : null;

    // Solo se toca Drive si al terminar el docente conserva algun soporte,
    // o si hay que retirar el diploma. Asi no se crean carpetas vacias.
    // La condicion tambien cubre una revision guardada antes de que
    // existieran estas columnas: al reabrirla se completa su trazabilidad.
    var quedanSoportes = !!blobActa || !!soportes.urlActa ||
                         !!blobDiploma || (!!soportes.urlDiploma && !quitarDiploma);

    if (quedanSoportes || (quitarDiploma && soportes.urlDiploma)) {
      var carpeta = carpetaDocente_(docente);
      soportes.idCarpeta  = carpeta.getId();
      soportes.urlCarpeta = carpeta.getUrl();

      if (blobActa) {
        var acta = guardarPdf_(carpeta, blobActa, nombreActa, [NOMBRE_ACTA]);
        soportes.idActa  = acta.id;
        soportes.urlActa = acta.url;
      }

      if (blobDiploma) {
        var diploma = guardarPdf_(carpeta, blobDiploma, nombreDiploma, [NOMBRE_DIPLOMA]);
        soportes.idDiploma  = diploma.id;
        soportes.urlDiploma = diploma.url;
      }

      if (quitarDiploma && !blobDiploma) {
        retirarPdf_(carpeta, nombreDiploma, [NOMBRE_DIPLOMA]);
        soportes.idDiploma  = '';
        soportes.urlDiploma = '';
      }
    }

    /* --- 3. Escritura en Validaciones -------------------------------- */
    var hoja = hojaValidaciones_();
    var mapa = mapaEncabezados_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]);
    exigirColumnas_(mapa, ['NUM_DOCUMENTO', 'ESTADO', 'FECHA_VALIDACION', 'FECHA_MODIFICACION'],
      HOJA_VALIDACIONES);

    var ahora = formatearFechaHora_(new Date());
    var estadoRevision = previo && previo.estadoRevision === REV_DEVUELTO
      ? REV_DEVUELTO
      : REV_POR_ENVIAR;
    var nuevaVersion = versionActual + 1;

    var valores = {
      NUM_DOCUMENTO: docente.documento,
      // En una edicion se conserva la fecha original de la revision.
      FECHA_VALIDACION: (previo && previo.fechaValidacion) ? previo.fechaValidacion : ahora,
      ID_CARPETA_DOCENTE:  soportes.idCarpeta,
      URL_CARPETA_DOCENTE: soportes.urlCarpeta,
      ID_ACTA:     soportes.idActa,
      URL_ACTA:    soportes.urlActa,
      ID_DIPLOMA:  soportes.idDiploma,
      URL_DIPLOMA: soportes.urlDiploma,
      OBSERVACIONES: observaciones,
      ESTADO: estado,
      FECHA_MODIFICACION: ahora,
      ESTADO_REVISION: estadoRevision,
      VERSION: nuevaVersion,
      GUARDADO_POR: identidad.correo
    };

    CRITERIOS.forEach(function (c) {
      valores['VAL_' + c.clave]  = criterios[c.clave].valor;
      valores['CORR_' + c.clave] = criterios[c.clave].correccion;
    });

    // Se relee el indice porque la carga de archivos pudo tardar.
    var actual = leerValidaciones_()[docente.clave];
    var fila = actual ? actual.fila : hoja.getLastRow() + 1;
    escribirFila_(hoja, mapa, fila, valores, !actual);
    registrarHistorial_(docente.documento, nuevaVersion, identidad, 'GUARDADO',
      previo ? previo.estadoRevision : '', estadoRevision, observaciones);

    SpreadsheetApp.flush();

    /* --- 4. Respuesta ------------------------------------------------ */
    return {
      documento: docente.documento,
      estado: estado,
      validacion: sinIdentificadores_({
        criterios: criterios,
        observaciones: observaciones,
        urlCarpeta: soportes.urlCarpeta,
        idActa: soportes.idActa,
        urlActa: soportes.urlActa,
        idDiploma: soportes.idDiploma,
        urlDiploma: soportes.urlDiploma,
        fechaValidacion: valores.FECHA_VALIDACION,
        fechaModificacion: ahora,
        estado: estado,
        estadoRevision: estadoRevision,
        version: nuevaVersion,
        guardadoPor: identidad.correo,
        enviadoPor: previo ? previo.enviadoPor : '',
        fechaEnvio: previo ? previo.fechaEnvio : '',
        revisadoPor: previo ? previo.revisadoPor : '',
        fechaRevision: previo ? previo.fechaRevision : '',
        decisionRevision: previo ? previo.decisionRevision : '',
        observacionRevision: previo ? previo.observacionRevision : '',
        estadoMen: previo ? previo.estadoMen : MEN_PENDIENTE,
        motivoSubsanacion: previo ? previo.motivoSubsanacion : '',
        fechaSubsanacion: previo ? previo.fechaSubsanacion : '',
        fechaDisponibleRadicacion: previo ? previo.fechaDisponibleRadicacion : '',
        subsanacionPor: previo ? previo.subsanacionPor : '',
        radicadoMen: previo ? previo.radicadoMen : false,
        radicadoPor: previo ? previo.radicadoPor : '',
        fechaRadicacionMen: previo ? previo.fechaRadicacionMen : '',
        revisionCriterios: previo ? previo.revisionCriterios : {},
        revisionCorrecciones: previo ? previo.revisionCorrecciones : {}
      }),
      resumen: resumenActual_()
    };

  } catch (e) {
    console.error('guardarValidacion: ' + (e && e.stack ? e.stack : e));
    throw new Error(e && e.message ? e.message : 'No fue posible guardar la revisión.');
  } finally {
    candado.releaseLock();
  }
}

/* ============================================================
   FLUJO DE APROBACION
   ============================================================ */

function hojaHistorial_() {
  var libro = libro_();
  var hoja = libro.getSheetByName(HOJA_HISTORIAL);
  var encabezados = [
    'FECHA', 'NUM_DOCUMENTO', 'VERSION', 'EVENTO',
    'ESTADO_ANTERIOR', 'ESTADO_NUEVO', 'CORREO', 'ROL', 'OBSERVACION'
  ];

  if (!hoja) {
    hoja = libro.insertSheet(HOJA_HISTORIAL);
    hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function registrarHistorial_(documento, version, identidad, evento, anterior, nuevo, observacion) {
  hojaHistorial_().appendRow([
    formatearFechaHora_(new Date()),
    documento,
    version,
    evento,
    anterior || '',
    nuevo || '',
    identidad.correo,
    identidad.rol,
    textoEntrante_(observacion, 2000)
  ]);
}

/** Datos consolidados para el informe operativo descargable. */
function obtenerInformeGestion(payload, identidad) {
  exigirRol_(identidad, [ROL_REVISOR]);
  var desde = fechaOperativa_(payload && payload.desde);
  var hasta = fechaOperativa_(payload && payload.hasta);
  if (hasta) hasta.setHours(23, 59, 59, 999);
  if (desde && hasta && desde.getTime() > hasta.getTime()) {
    throw new Error('La fecha inicial del informe no puede ser posterior a la fecha final.');
  }

  var docentes = leerDocentes_();
  var indice = leerValidaciones_();
  var nombres = {};
  var registros = docentes.map(function (docente) {
    nombres[docente.clave] = docente.nombreCompleto;
    var validacion = indice[docente.clave] ? armarValidacion_(indice[docente.clave]) : null;
    return {
      documento: docente.documento,
      docente: docente.nombreCompleto,
      estadoRevision: validacion ? validacion.estadoRevision : REV_POR_ENVIAR,
      estadoMen: validacion && validacion.estadoRevision === REV_APROBADO
        ? validacion.estadoMen : '',
      guardadoPor: validacion ? validacion.guardadoPor : '',
      fechaModificacion: validacion ? validacion.fechaModificacion : '',
      enviadoPor: validacion ? validacion.enviadoPor : '',
      fechaEnvio: validacion ? validacion.fechaEnvio : '',
      revisadoPor: validacion ? validacion.revisadoPor : '',
      fechaRevision: validacion ? validacion.fechaRevision : '',
      subsanacionPor: validacion ? validacion.subsanacionPor : '',
      fechaSubsanacion: validacion ? validacion.fechaSubsanacion : '',
      fechaDisponibleRadicacion: validacion ? validacion.fechaDisponibleRadicacion : '',
      motivoSubsanacion: validacion ? validacion.motivoSubsanacion : '',
      radicadoPor: validacion ? validacion.radicadoPor : '',
      fechaRadicacionMen: validacion ? validacion.fechaRadicacionMen : ''
    };
  });

  var hoja = hojaHistorial_();
  var eventos = [];
  var porUsuario = {};
  if (hoja.getLastRow() >= 2) {
    var datos = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getValues();
    var mapa = mapaEncabezados_(datos[0]);
    for (var i = 1; i < datos.length; i++) {
      var fechaTexto = textoFechaHora_(datos[i][mapa.FECHA - 1]);
      var fecha = fechaOperativa_(fechaTexto);
      if (desde && (!fecha || fecha.getTime() < desde.getTime())) continue;
      if (hasta && (!fecha || fecha.getTime() > hasta.getTime())) continue;
      var documento = normalizarDocumento_(datos[i][mapa.NUM_DOCUMENTO - 1]);
      var correo = texto_(datos[i][mapa.CORREO - 1]).toLowerCase();
      var evento = texto_(datos[i][mapa.EVENTO - 1]).toUpperCase();
      var fila = {
        fecha: fechaTexto,
        documento: documento,
        docente: nombres[claveDocumento_(documento)] || '',
        evento: evento,
        estadoAnterior: texto_(datos[i][mapa.ESTADO_ANTERIOR - 1]),
        estadoNuevo: texto_(datos[i][mapa.ESTADO_NUEVO - 1]),
        correo: correo,
        rol: texto_(datos[i][mapa.ROL - 1]),
        observacion: texto_(datos[i][mapa.OBSERVACION - 1])
      };
      eventos.push(fila);
      var claveUsuario = correo + '|' + fila.rol;
      if (!porUsuario[claveUsuario]) {
        porUsuario[claveUsuario] = { correo: correo, rol: fila.rol, total: 0, eventos: {} };
      }
      porUsuario[claveUsuario].total++;
      porUsuario[claveUsuario].eventos[evento] =
        (porUsuario[claveUsuario].eventos[evento] || 0) + 1;
    }
  }

  return {
    generado: formatearFechaHora_(new Date()),
    desde: payload && payload.desde ? String(payload.desde) : '',
    hasta: payload && payload.hasta ? String(payload.hasta) : '',
    resumen: resumirEstados_(registros.map(function (r) {
      return {
        tieneValidacion: !!r.fechaModificacion,
        estadoRevision: r.estadoRevision,
        estadoMen: r.estadoMen,
        radicadoMen: r.estadoMen === MEN_RADICADO
      };
    })),
    usuarios: Object.keys(porUsuario).map(function (clave) { return porUsuario[clave]; }),
    registros: registros,
    historial: eventos
  };
}

function exigirVersion_(payload, validacion) {
  var esperada = Number(payload && payload.version);
  if (!isFinite(esperada) || esperada !== validacion.version) {
    throw new Error('Este registro cambió desde que lo abrió. Vuelva al listado y ábralo de nuevo.');
  }
}

/** Talento Humano cierra la edicion y entrega el registro al revisor. */
function enviarARevision(payload, identidad) {
  exigirRol_(identidad, [ROL_TALENTO_HUMANO]);
  var candado = LockService.getScriptLock();
  try {
    candado.waitLock(30000);
  } catch (e) {
    throw new Error('El sistema está atendiendo otra solicitud. Intente de nuevo en unos segundos.');
  }

  try {
    var documento = normalizarDocumento_(payload && payload.documento);
    var docente = buscarDocente_(documento);
    if (!docente) throw new Error('El docente indicado no figura en la hoja Docentes.');

    var registro = leerValidaciones_()[docente.clave];
    if (!registro) throw new Error('Primero debe guardar la validación antes de enviarla.');

    var validacion = armarValidacion_(registro);
    exigirVersion_(payload, validacion);
    if (validacion.estadoRevision !== REV_POR_ENVIAR &&
        validacion.estadoRevision !== REV_DEVUELTO) {
      throw new Error('Este registro ya fue enviado y no se puede volver a enviar en su estado actual.');
    }

    var configuracion = leerConfiguracion_();
    if (configuracion.actaObligatoria && !validacion.urlActa) {
      throw new Error('Falta el acta de grado obligatoria.');
    }
    if (configuracion.diplomaObligatorio && !validacion.urlDiploma) {
      throw new Error('Falta el diploma de grado obligatorio.');
    }

    var hoja = hojaValidaciones_();
    var mapa = mapaEncabezados_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]);
    var ahora = formatearFechaHora_(new Date());
    var nuevaVersion = validacion.version + 1;
    var valores = {
      ESTADO_REVISION: REV_EN_REVISION,
      VERSION: nuevaVersion,
      ENVIADO_POR: identidad.correo,
      FECHA_ENVIO: ahora,
      REVISADO_POR: '',
      FECHA_REVISION: '',
      DECISION_REVISION: '',
      OBSERVACION_REVISION: ''
    };
    CRITERIOS.forEach(function (c) {
      valores['REV_' + c.clave] = '';
      valores['REV_CORR_' + c.clave] = '';
    });

    escribirFila_(hoja, mapa, registro.fila, valores, false);
    registrarHistorial_(docente.documento, nuevaVersion, identidad, 'ENVIADO_A_REVISION',
      validacion.estadoRevision, REV_EN_REVISION, '');
    SpreadsheetApp.flush();

    return {
      documento: docente.documento,
      estadoRevision: REV_EN_REVISION,
      version: nuevaVersion,
      resumen: resumenActual_()
    };
  } finally {
    candado.releaseLock();
  }
}

/** El revisor aprueba o devuelve, dejando una decision por cada criterio. */
function decidirRevision(payload, identidad) {
  exigirRol_(identidad, [ROL_REVISOR]);
  var candado = LockService.getScriptLock();
  try {
    candado.waitLock(30000);
  } catch (e) {
    throw new Error('El sistema está atendiendo otra solicitud. Intente de nuevo en unos segundos.');
  }

  try {
    var documento = normalizarDocumento_(payload && payload.documento);
    var docente = buscarDocente_(documento);
    if (!docente) throw new Error('El docente indicado no figura en la hoja Docentes.');

    var registro = leerValidaciones_()[docente.clave];
    if (!registro) throw new Error('No existe una validación para revisar.');
    var validacion = armarValidacion_(registro);
    exigirVersion_(payload, validacion);
    if (validacion.estadoRevision !== REV_EN_REVISION) {
      throw new Error('Este registro no está pendiente de decisión del revisor.');
    }

    var decision = String(payload.decision || '').trim().toUpperCase();
    if (decision !== REV_APROBADO && decision !== REV_DEVUELTO) {
      throw new Error('Seleccione aprobar o devolver la revisión.');
    }

    var entrantes = payload.criterios && typeof payload.criterios === 'object'
      ? payload.criterios : {};
    var resultados = {};
    var correccionesRevisor = {};
    var noConformes = 0;
    CRITERIOS.forEach(function (c) {
      var recibido = entrantes[c.clave];
      var valor = String(recibido && typeof recibido === 'object'
        ? recibido.valor : recibido || '').trim().toUpperCase();
      if (valor !== REV_CONFORME && valor !== REV_NO_CONFORME) {
        throw new Error('Falta revisar el criterio "' + c.etiqueta + '".');
      }
      var correccion = textoEntrante_(
        recibido && typeof recibido === 'object' ? recibido.correccion : '', 500);
      if (valor === REV_NO_CONFORME && correccion && c.normalizarCorreccion === 'mayusculas') {
        correccion = correccion.toUpperCase();
      }
      if (valor === REV_NO_CONFORME && correccion && c.opcionesCorreccion &&
          c.opcionesCorreccion.indexOf(correccion) === -1) {
        throw new Error('Seleccione un valor permitido para "' + c.etiqueta + '".');
      }
      if (valor === REV_NO_CONFORME && correccion && c.tipoCorreccion === 'fecha') {
        correccion = normalizarFechaCorreccion_(correccion, c.etiqueta);
      }
      if (valor === REV_CONFORME) correccion = '';
      resultados[c.clave] = valor;
      correccionesRevisor[c.clave] = correccion;
      if (valor === REV_NO_CONFORME) noConformes++;
    });

    var observacion = textoEntrante_(payload.observacion, 2000);
    if (decision === REV_APROBADO && noConformes) {
      CRITERIOS.forEach(function (c) {
        if (resultados[c.clave] === REV_NO_CONFORME && !correccionesRevisor[c.clave]) {
          throw new Error('Indique el valor correcto para "' + c.etiqueta +
            '" o devuelva el registro a Talento Humano.');
        }
      });
    }
    if (decision === REV_DEVUELTO && !observacion) {
      throw new Error('Explique en la observación qué debe corregir Talento Humano.');
    }

    var hoja = hojaValidaciones_();
    var mapa = mapaEncabezados_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]);
    var ahora = formatearFechaHora_(new Date());
    var nuevaVersion = validacion.version + 1;
    var valores = {
      ESTADO_REVISION: decision,
      VERSION: nuevaVersion,
      REVISADO_POR: identidad.correo,
      FECHA_REVISION: ahora,
      DECISION_REVISION: decision,
      OBSERVACION_REVISION: observacion,
      ESTADO_MEN: decision === REV_APROBADO ? MEN_PENDIENTE : '',
      MOTIVO_SUBSANACION: '',
      FECHA_SUBSANACION: '',
      FECHA_DISPONIBLE_RADICACION: '',
      SUBSANACION_POR: '',
      RADICADO_MEN: '',
      RADICADO_POR: '',
      FECHA_RADICACION_MEN: ''
    };
    var detalleCorrecciones = [];
    CRITERIOS.forEach(function (c) {
      valores['REV_' + c.clave] = resultados[c.clave];
      valores['REV_CORR_' + c.clave] = correccionesRevisor[c.clave];
      if (decision === REV_APROBADO && resultados[c.clave] === REV_NO_CONFORME) {
        valores['VAL_' + c.clave] = NO_COINCIDE;
        valores['CORR_' + c.clave] = correccionesRevisor[c.clave];
        detalleCorrecciones.push(c.etiqueta + ': ' + correccionesRevisor[c.clave]);
      }
    });
    if (detalleCorrecciones.length) valores.ESTADO = ESTADO_CORRECCION;

    escribirFila_(hoja, mapa, registro.fila, valores, false);
    var notaHistorial = observacion;
    if (detalleCorrecciones.length) {
      notaHistorial = 'Corrección directa del revisor: ' + detalleCorrecciones.join('; ') +
        (observacion ? '. Observación: ' + observacion : '');
    }
    registrarHistorial_(docente.documento, nuevaVersion, identidad,
      decision === REV_APROBADO
        ? (detalleCorrecciones.length ? 'APROBADO_CON_CORRECCION_REVISOR' : 'APROBADO')
        : 'DEVUELTO',
      REV_EN_REVISION, decision, notaHistorial);
    SpreadsheetApp.flush();

    return {
      documento: docente.documento,
      estado: detalleCorrecciones.length ? ESTADO_CORRECCION : validacion.estado,
      estadoRevision: decision,
      estadoMen: decision === REV_APROBADO ? MEN_PENDIENTE : '',
      version: nuevaVersion,
      resumen: resumenActual_()
    };
  } finally {
    candado.releaseLock();
  }
}

/** Deja un aprobado esperando la subsanacion operativa antes de radicarlo. */
function ponerEnSubsanacion(payload, identidad) {
  exigirRol_(identidad, [ROL_REVISOR]);
  var candado = LockService.getScriptLock();
  try {
    candado.waitLock(30000);
  } catch (e) {
    throw new Error('El sistema está atendiendo otra solicitud. Intente de nuevo en unos segundos.');
  }

  try {
    var documento = normalizarDocumento_(payload && payload.documento);
    var motivo = textoEntrante_(payload && payload.motivo, 1000);
    if (!motivo) throw new Error('Explique el motivo de la subsanación.');
    var fechaDisponible = normalizarFechaCorreccion_(
      payload && payload.fechaDisponible, 'fecha disponible para radicación');
    var fechaElegida = fechaOperativa_(fechaDisponible);
    var minimo = hoyColombia_();
    minimo.setDate(minimo.getDate() + 1);
    if (!fechaElegida || fechaElegida.getTime() < minimo.getTime()) {
      throw new Error('La fecha disponible debe ser, como mínimo, el día siguiente.');
    }

    var docente = buscarDocente_(documento);
    if (!docente) throw new Error('El docente indicado no figura en la hoja Docentes.');
    var registro = leerValidaciones_()[docente.clave];
    if (!registro) throw new Error('No existe una validación para este docente.');
    var validacion = armarValidacion_(registro);
    exigirVersion_(payload, validacion);
    if (validacion.estadoRevision !== REV_APROBADO || validacion.radicadoMen) {
      throw new Error('Solo se puede poner en subsanación una revisión aprobada y aún no radicada.');
    }

    var hoja = hojaValidaciones_();
    var mapa = mapaEncabezados_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]);
    var ahora = formatearFechaHora_(new Date());
    var nuevaVersion = validacion.version + 1;
    escribirFila_(hoja, mapa, registro.fila, {
      ESTADO_MEN: MEN_SUBSANACION,
      MOTIVO_SUBSANACION: motivo,
      FECHA_SUBSANACION: ahora,
      FECHA_DISPONIBLE_RADICACION: fechaDisponible,
      SUBSANACION_POR: identidad.correo,
      VERSION: nuevaVersion
    }, false);
    registrarHistorial_(docente.documento, nuevaVersion, identidad, 'SUBSANACION_MEN',
      validacion.estadoMen, MEN_SUBSANACION,
      motivo + ' Disponible para radicar: ' + fechaDisponible + '.');
    SpreadsheetApp.flush();

    return {
      documento: docente.documento,
      version: nuevaVersion,
      estadoMen: MEN_SUBSANACION,
      motivoSubsanacion: motivo,
      fechaSubsanacion: ahora,
      fechaDisponibleRadicacion: fechaDisponible,
      subsanacionPor: identidad.correo,
      resumen: resumenActual_()
    };
  } finally {
    candado.releaseLock();
  }
}

/** Registra que un aprobado ya fue cargado externamente en SNIES/MEN. */
function confirmarRadicadoMen(payload, identidad) {
  exigirRol_(identidad, [ROL_REVISOR]);
  var candado = LockService.getScriptLock();
  try {
    candado.waitLock(30000);
  } catch (e) {
    throw new Error('El sistema está atendiendo otra solicitud. Intente de nuevo en unos segundos.');
  }

  try {
    var documento = normalizarDocumento_(payload && payload.documento);
    var docente = buscarDocente_(documento);
    if (!docente) throw new Error('El docente indicado no figura en la hoja Docentes.');

    var registro = leerValidaciones_()[docente.clave];
    if (!registro) throw new Error('No existe una validación para este docente.');
    var validacion = armarValidacion_(registro);
    exigirVersion_(payload, validacion);
    if (validacion.estadoRevision !== REV_APROBADO) {
      throw new Error('Solo se puede confirmar el radicado MEN de una revisión aprobada.');
    }
    if (validacion.estadoMen === MEN_SUBSANACION) {
      throw new Error('La solicitud sigue en subsanación. Estará disponible para radicar el ' +
        (validacion.fechaDisponibleRadicacion || 'día programado') + '.');
    }
    if (validacion.radicadoMen) {
      return {
        documento: docente.documento,
        version: validacion.version,
        estadoMen: MEN_RADICADO,
        radicadoMen: true,
        radicadoPor: validacion.radicadoPor,
        fechaRadicacionMen: validacion.fechaRadicacionMen
      };
    }

    var hoja = hojaValidaciones_();
    var mapa = mapaEncabezados_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]);
    var ahora = formatearFechaHora_(new Date());
    var nuevaVersion = validacion.version + 1;
    escribirFila_(hoja, mapa, registro.fila, {
      ESTADO_MEN: MEN_RADICADO,
      RADICADO_MEN: 'SI',
      RADICADO_POR: identidad.correo,
      FECHA_RADICACION_MEN: ahora,
      VERSION: nuevaVersion
    }, false);
    registrarHistorial_(docente.documento, nuevaVersion, identidad, 'RADICADO_MEN',
      REV_APROBADO, REV_APROBADO, 'Carga externa en SNIES/MEN confirmada.');
    SpreadsheetApp.flush();

    return {
      documento: docente.documento,
      version: nuevaVersion,
      estadoMen: MEN_RADICADO,
      radicadoMen: true,
      radicadoPor: identidad.correo,
      fechaRadicacionMen: ahora,
      resumen: resumenActual_()
    };
  } finally {
    candado.releaseLock();
  }
}

/**
 * Escribe una fila localizando cada dato por su encabezado. Las columnas
 * que la aplicacion no conoce se dejan intactas.
 */
function escribirFila_(hoja, mapa, fila, valores, esNueva) {
  var ancho = hoja.getLastColumn();
  var rango = hoja.getRange(fila, 1, 1, ancho);

  var datos;
  if (esNueva) {
    datos = [];
    for (var i = 0; i < ancho; i++) datos.push('');
    if (mapa.NUM_DOCUMENTO) hoja.getRange(fila, mapa.NUM_DOCUMENTO).setNumberFormat('@');
  } else {
    datos = rango.getValues()[0];
  }

  Object.keys(valores).forEach(function (encabezado) {
    var columna = mapa[encabezado];
    if (columna) datos[columna - 1] = valores[encabezado];
  });

  rango.setValues([datos]);
}

/** Vuelve a contar las cuatro tarjetas despues de guardar. */
function resumenActual_() {
  var indice = leerValidaciones_();
  return resumirEstados_(leerDocentes_().map(function (d) {
    var validacion = indice[d.clave] ? armarValidacion_(indice[d.clave]) : null;
    return {
      tieneValidacion: !!validacion,
      estadoRevision: validacion ? validacion.estadoRevision : REV_POR_ENVIAR,
      estadoMen: validacion ? validacion.estadoMen : MEN_PENDIENTE,
      radicadoMen: validacion ? validacion.radicadoMen : false
    };
  }));
}

/**
 * Migra a EN_REVISION las validaciones existentes que siguen POR_ENVIAR
 * y ya cumplen los soportes obligatorios. Es idempotente: los registros
 * enviados, devueltos o aprobados no se modifican.
 */
function enviarCargadosExistentesARevision(correoAdministrador) {
  var actor = String(correoAdministrador || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor)) {
    throw new Error('Indique el correo institucional del responsable de la migración.');
  }

  var configuracion = leerConfiguracion_();
  var dominio = String(configuracion.dominioAutorizado || '').toLowerCase();
  if (dominio && actor.slice(-(dominio.length + 1)) !== '@' + dominio) {
    throw new Error('El responsable no pertenece al dominio institucional autorizado.');
  }

  var candado = LockService.getScriptLock();
  candado.waitLock(30000);
  try {
    var hoja = hojaValidaciones_();
    var mapa = mapaEncabezados_(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]);
    var indice = leerValidaciones_();
    var ahora = formatearFechaHora_(new Date());
    var enviados = 0;
    var omitidosSinSoporte = 0;

    Object.keys(indice).forEach(function (clave) {
      var registro = indice[clave];
      var validacion = armarValidacion_(registro);
      if (validacion.estadoRevision !== REV_POR_ENVIAR) return;

      var tieneSoporte = !!validacion.urlActa || !!validacion.urlDiploma;
      var cumpleActa = !configuracion.actaObligatoria || !!validacion.urlActa;
      var cumpleDiploma = !configuracion.diplomaObligatorio || !!validacion.urlDiploma;
      if (!tieneSoporte || !cumpleActa || !cumpleDiploma) {
        omitidosSinSoporte++;
        return;
      }

      var documento = normalizarDocumento_(
        registro.datos[registro.mapa.NUM_DOCUMENTO - 1]);
      var nuevaVersion = validacion.version + 1;
      var valores = {
        ESTADO_REVISION: REV_EN_REVISION,
        VERSION: nuevaVersion,
        ENVIADO_POR: validacion.guardadoPor || actor,
        FECHA_ENVIO: ahora,
        REVISADO_POR: '',
        FECHA_REVISION: '',
        DECISION_REVISION: '',
        OBSERVACION_REVISION: ''
      };
      CRITERIOS.forEach(function (c) { valores['REV_' + c.clave] = ''; });
      escribirFila_(hoja, mapa, registro.fila, valores, false);
      registrarHistorial_(documento, nuevaVersion,
        { correo: actor, rol: 'ADMINISTRADOR' },
        'MIGRADO_A_REVISION', REV_POR_ENVIAR, REV_EN_REVISION,
        'Envío administrativo de documentos previamente cargados.');
      enviados++;
    });

    SpreadsheetApp.flush();
    return {
      enviados: enviados,
      omitidosSinSoporte: omitidosSinSoporte,
      resumen: resumenActual_()
    };
  } finally {
    candado.releaseLock();
  }
}

/* ============================================================
   PREPARACION (se ejecuta una sola vez desde el editor)
   ============================================================ */

/**
 * Crea de una sola vez la carpeta de cada docente de la hoja, con el
 * nombre canonico "NUM_DOCUMENTO - NOMBRE COMPLETO".
 *
 * Es idempotente: la carpeta que ya exista se reutiliza y se informa,
 * nunca se duplica. Se puede ejecutar las veces que haga falta, por
 * ejemplo despues de agregar docentes a la hoja.
 *
 * No es obligatoria: la aplicacion crea la carpeta de cada docente al
 * guardar su revision. Sirve para dejar el arbol listo de antemano, si se
 * prefiere archivar los soportes en Drive antes de revisarlos.
 */
function crearCarpetasDocentes() {
  var docentes = leerDocentes_();
  var principal = carpetaPrincipal_();
  var indice = indiceCarpetas_(principal);

  var creadas = [];
  var reutilizadas = 0;

  docentes.forEach(function (docente) {
    if (buscarCarpeta_(indice, docente.documento)) {
      reutilizadas++;
      return;
    }

    var nombre = nombreCarpeta_(docente);
    var nueva = principal.createFolder(nombre);

    // Se agrega al indice para que un documento repetido en la hoja no
    // provoque una segunda carpeta en esta misma ejecucion.
    indice.porNumero[docente.clave] = nueva;
    indice.todas.push({ nombre: nombre, carpeta: nueva });
    creadas.push(nombre);
  });

  var informe =
    'Carpeta principal: ' + principal.getName() + '\n' +
    'Docentes en la hoja: ' + docentes.length + '\n' +
    'Carpetas que ya existian (reutilizadas): ' + reutilizadas + '\n' +
    'Carpetas creadas ahora: ' + creadas.length +
    (creadas.length ? '\n\n' + creadas.map(function (n) { return '  + ' + n; }).join('\n') : '');

  console.log(informe);
  return informe;
}

/**
 * Separa las subcarpetas de la carpeta principal en dos grupos:
 *
 *   canonicas -> su nombre empieza por el documento de un docente de la
 *                hoja. Son las que usa la aplicacion.
 *   sueltas   -> cualquier otra. Tipicamente carpetas creadas a mano,
 *                nombradas solo con el nombre de la persona.
 *
 * De cada suelta intenta adivinar a que docente corresponde comparando el
 * nombre sin tildes, sin mayusculas y sin espacios repetidos.
 */
function analizarCarpetas_() {
  var principal = carpetaPrincipal_();
  var docentes = leerDocentes_();

  var porDocumento = {};
  var porNombre = {};
  docentes.forEach(function (d) {
    porDocumento[d.clave] = d;
    porNombre[normalizarEncabezado_(d.nombreCompleto)] = d;
  });

  var canonicas = {};
  var sueltas = [];

  var hijas = principal.getFolders();
  while (hijas.hasNext()) {
    var carpeta = hijas.next();
    var nombre = String(carpeta.getName()).trim();
    var inicial = claveDocumento_(nombre.split('-')[0]);

    if (inicial && porDocumento[inicial]) {
      canonicas[inicial] = carpeta;
    } else {
      sueltas.push({
        nombre: nombre,
        carpeta: carpeta,
        docente: porNombre[normalizarEncabezado_(nombre)] || null
      });
    }
  }

  return { principal: principal, canonicas: canonicas, sueltas: sueltas };
}

/** Lista los archivos de una carpeta. */
function archivosDe_(carpeta) {
  var lista = [];
  var archivos = carpeta.getFiles();
  while (archivos.hasNext()) lista.push(archivos.next());
  return lista;
}

/**
 * Informe de solo lectura: que carpetas sobran, a que docente
 * corresponden y que documentos tienen dentro. No mueve ni borra nada.
 *
 * Es el paso previo a consolidarCarpetas(): conviene leerlo antes.
 */
function revisarCarpetas() {
  var analisis = analizarCarpetas_();
  var lineas = [
    'Carpeta principal: ' + analisis.principal.getName(),
    'Carpetas con numero de documento (las que usa la app): ' +
      Object.keys(analisis.canonicas).length,
    'Carpetas sueltas (sin numero): ' + analisis.sueltas.length,
    ''
  ];

  var conArchivos = 0;
  var sinPareja = 0;

  analisis.sueltas.forEach(function (suelta) {
    var archivos = archivosDe_(suelta.carpeta);
    if (archivos.length) conArchivos++;
    if (!suelta.docente) sinPareja++;

    lineas.push('"' + suelta.nombre + '"');
    lineas.push('   docente: ' + (suelta.docente
      ? suelta.docente.documento + ' - ' + suelta.docente.nombreCompleto
      : '*** SIN COINCIDENCIA EN LA HOJA ***'));
    lineas.push('   archivos: ' + archivos.length);
    archivos.slice(0, 4).forEach(function (a) {
      lineas.push('      - ' + a.getName());
    });
    if (archivos.length > 4) lineas.push('      - ... y ' + (archivos.length - 4) + ' mas');
    lineas.push('');
  });

  lineas.push('RESUMEN');
  lineas.push('  Sueltas con documentos dentro: ' + conArchivos);
  lineas.push('  Sueltas que no casan con ningun docente: ' + sinPareja);
  lineas.push('');
  lineas.push(conArchivos === 0
    ? 'Ninguna carpeta suelta tiene documentos: se pueden borrar sin perder nada.'
    : 'Hay documentos en carpetas sueltas: ejecute consolidarCarpetas() para moverlos.');

  var informe = lineas.join('\n');
  console.log(informe);
  return informe;
}

/**
 * Mueve los documentos de cada carpeta suelta a la carpeta canonica del
 * docente y manda a la papelera la suelta si queda vacia.
 *
 * Solo actua sobre las sueltas que casan con un docente de la hoja. Una
 * carpeta sin coincidencia se deja intacta y se informa: es preferible
 * que alguien la mire a que el programa adivine.
 *
 * Los archivos conservan su nombre original. Renombrarlos exigiria saber
 * cual es el acta y cual el diploma, y eso no se puede deducir sin verlos.
 */
function consolidarCarpetas() {
  var analisis = analizarCarpetas_();
  var lineas = [];
  var movidos = 0;
  var vaciadas = 0;
  var omitidas = [];

  analisis.sueltas.forEach(function (suelta) {
    if (!suelta.docente) {
      omitidas.push(suelta.nombre + '  (no casa con ningun docente)');
      return;
    }

    var destino = analisis.canonicas[suelta.docente.clave];
    if (!destino) {
      // No deberia pasar si ya se ejecuto crearCarpetasDocentes().
      destino = analisis.principal.createFolder(nombreCarpeta_(suelta.docente));
      analisis.canonicas[suelta.docente.clave] = destino;
    }

    var archivos = archivosDe_(suelta.carpeta);
    archivos.forEach(function (archivo) {
      archivo.moveTo(destino);
      movidos++;
      lineas.push('  ' + archivo.getName() + '   ->   ' + destino.getName());
    });

    // Solo se retira si de verdad quedo vacia: si tenia subcarpetas, se
    // deja para que alguien decida.
    if (!archivosDe_(suelta.carpeta).length && !suelta.carpeta.getFolders().hasNext()) {
      suelta.carpeta.setTrashed(true);
      vaciadas++;
    } else {
      omitidas.push(suelta.nombre + '  (no quedo vacia, se conserva)');
    }
  });

  var informe =
    'Archivos movidos: ' + movidos + '\n' +
    'Carpetas sueltas enviadas a la papelera: ' + vaciadas + '\n' +
    (lineas.length ? '\nMOVIMIENTOS:\n' + lineas.join('\n') + '\n' : '') +
    (omitidas.length ? '\nSIN TOCAR:\n  ' + omitidas.join('\n  ') : '');

  console.log(informe);
  return informe;
}

/**
 * Diagnostico de solo lectura: muestra como esta organizada hoy la
 * carpeta principal de Drive y que columnas tiene la hoja Docentes.
 *
 * No crea, mueve ni borra nada. Sirve para saber si las carpetas que ya
 * existen coinciden con lo que la aplicacion espera encontrar.
 */
function inspeccionarDrive() {
  var principal = carpetaPrincipal_();
  var lineas = ['CARPETA PRINCIPAL: ' + principal.getName(), ''];

  var hoja = hojaDe_(HOJA_DOCENTES);
  var encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0]
    .filter(function (e) { return String(e).trim() !== ''; });
  lineas.push('COLUMNAS DE LA HOJA DOCENTES:');
  lineas.push('  ' + encabezados.join(' | '));
  lineas.push('');

  lineas.push('ARBOL DE CARPETAS (dos niveles):');
  lineas.push('');
  ramaDrive_(principal, '  ', 2, lineas);

  var informe = lineas.join('\n');
  console.log(informe);
  return informe;
}

/**
 * Dibuja el contenido de una carpeta: primero sus archivos y despues sus
 * subcarpetas, bajando hasta "profundidad" niveles. Muestra como maximo
 * seis entradas por nivel, que es suficiente para reconocer el patron de
 * nombres sin llenar el registro.
 */
function ramaDrive_(carpeta, sangria, profundidad, lineas) {
  var archivos = carpeta.getFiles();
  var cuantos = 0;
  while (archivos.hasNext()) {
    var archivo = archivos.next();
    cuantos++;
    if (cuantos <= 6) {
      lineas.push(sangria + '- ' + archivo.getName() + '   [' + archivo.getMimeType() + ']');
    }
  }
  if (cuantos > 6) lineas.push(sangria + '- ... y ' + (cuantos - 6) + ' archivo(s) mas');
  if (cuantos === 0) lineas.push(sangria + '(sin archivos)');

  if (profundidad <= 0) return;

  var subcarpetas = carpeta.getFolders();
  var total = 0;
  var mostradas = 0;

  while (subcarpetas.hasNext()) {
    var hija = subcarpetas.next();
    total++;
    if (mostradas >= 6) continue;
    mostradas++;

    lineas.push('');
    lineas.push(sangria + 'CARPETA: "' + hija.getName() + '"');
    lineas.push(sangria + '  ID: ' + hija.getId());
    ramaDrive_(hija, sangria + '    ', profundidad - 1, lineas);
  }

  if (total === 0) lineas.push(sangria + '(sin subcarpetas)');
  else if (total > mostradas) {
    lineas.push('');
    lineas.push(sangria + '... y ' + (total - mostradas) + ' carpeta(s) mas (total: ' + total + ')');
  } else {
    lineas.push('');
    lineas.push(sangria + '(total de subcarpetas en este nivel: ' + total + ')');
  }
}

/**
 * Crea la hoja Validaciones con sus encabezados y comprueba que la
 * configuracion y la carpeta de Drive esten en orden. Util al instalar la
 * aplicacion; no es necesaria para el funcionamiento diario.
 */
function prepararAuditoria() {
  var configuracion = leerConfiguracion_();
  hojaValidaciones_();
  prepararUsuarios();
  hojaHistorial_();
  var docentes = leerDocentes_();
  var carpeta = carpetaPrincipal_();

  var informe =
    'Auditoría: ' + configuracion.nombreAuditoria + '\n' +
    'Docentes en la hoja: ' + docentes.length + '\n' +
    'Acta obligatoria: ' + (configuracion.actaObligatoria ? 'SI' : 'NO') + '\n' +
    'Diploma obligatorio: ' + (configuracion.diplomaObligatorio ? 'SI' : 'NO') + '\n' +
    'Carpeta principal de Drive: ' + carpeta.getName() + '\n' +
    'Hoja Validaciones: lista con ' + encabezadosValidaciones_().length + ' columnas.\n' +
    'Hoja Usuarios: lista para 3 cuentas de Talento Humano, 1 Revisor y 2 de Consulta.\n' +
    'Hoja HistorialRevisiones: lista.';

  console.log(informe);
  return informe;
}
