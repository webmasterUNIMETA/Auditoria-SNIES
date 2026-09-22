/**
 * construir_vista_previa.mjs
 *
 * Arma vista_previa.html: la aplicacion real (Index + Styles + Scripts +
 * Logo) con un servidor simulado, para revisar el diseno en el navegador
 * sin desplegar nada en Apps Script.
 *
 * Uso:  node construir_vista_previa.mjs
 *
 * El archivo generado es SOLO para revisar la interfaz. No guarda nada,
 * no toca Drive y no habla con ninguna hoja de calculo.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = dirname(fileURLToPath(import.meta.url));
const leer = (nombre) => readFileSync(join(raiz, nombre), 'utf8');

const NOMBRE_AUDITORIA = 'Auditoría Docentes 2026-1';

/* ------------------------------------------------------------------
   Datos de muestra: mismos campos y nombres que devuelve Code.gs
   ------------------------------------------------------------------ */

const CRITERIOS = [
  ['NUM_DOCUMENTO',    'Número de documento'],
  ['PRIMER_NOMBRE',    'Primer nombre'],
  ['SEGUNDO_NOMBRE',   'Segundo nombre'],
  ['PRIMER_APELLIDO',  'Primer apellido'],
  ['SEGUNDO_APELLIDO', 'Segundo apellido'],
  ['NIVEL_ESTUDIO',    'Máximo nivel de estudio reportado SNIES'],
  ['TITULO',           'Título obtenido'],
  ['FECHA_GRADO',      'Fecha de grado'],
  ['PAIS',             'País donde estudió'],
  ['IES',              'Nombre de la IES donde estudió']
].map(([clave, etiqueta]) => ({
  clave,
  etiqueta,
  opcionesCorreccion: clave === 'NIVEL_ESTUDIO'
    ? ['ESPECIALIZACIÓN UNIVERSITARIA', 'MAESTRÍA']
    : [],
  tipoCorreccion: clave === 'FECHA_GRADO' ? 'fecha' : 'texto',
  normalizarCorreccion: [
    'PRIMER_NOMBRE', 'SEGUNDO_NOMBRE', 'PRIMER_APELLIDO',
    'SEGUNDO_APELLIDO', 'NIVEL_ESTUDIO', 'TITULO', 'IES'
  ].includes(clave) ? 'mayusculas' : ''
}));

const MUESTRA = [
  ['CC', 'DOC-EJ-001', 'DOCENTE', 'EJEMPLO', 'UNO', '',
   'ESPECIALIZACIÓN UNIVERSITARIA', 'TÍTULO ACADÉMICO DE EJEMPLO',
   '28/01/2020', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'PENDIENTE'],
  ['CC', 'DOC-EJ-002', 'DOCENTE', 'EJEMPLO', 'DOS', '',
   'MAESTRÍA', 'TÍTULO DE MAESTRÍA DE EJEMPLO',
   '15/06/2021', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'VALIDADO'],
  ['CC', 'DOC-EJ-003', 'DOCENTE', 'EJEMPLO', 'TRES', '',
   'Doctorado', 'TÍTULO DE DOCTORADO DE EJEMPLO',
   '02/12/2022', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'REQUIERE_CORRECCION'],
  ['CC', 'DOC-EJ-004', 'DOCENTE', 'EJEMPLO', 'CUATRO', '',
   'ESPECIALIZACIÓN UNIVERSITARIA', 'TÍTULO DE ESPECIALIZACIÓN DE EJEMPLO',
   '20/09/2019', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'PENDIENTE'],
  ['TI', 'DOC-EJ-005', 'DOCENTE', 'EJEMPLO', 'CINCO', '',
   'Universitaria', 'TÍTULO UNIVERSITARIO DE EJEMPLO',
   '11/03/2020', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'PENDIENTE'],
  ['CC', 'DOC-EJ-006', 'DOCENTE', 'EJEMPLO', 'SEIS', '',
   'MAESTRÍA', 'TÍTULO DE MAESTRÍA DE EJEMPLO',
   '08/07/2022', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'PENDIENTE'],
  ['CC', 'DOC-EJ-007', 'DOCENTE', 'EJEMPLO', 'SIETE', '',
   'MAESTRÍA', 'TÍTULO DE MAESTRÍA DE EJEMPLO',
   '19/11/2021', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'PENDIENTE'],
  ['CC', 'DOC-EJ-008', 'DOCENTE', 'EJEMPLO', 'OCHO', '',
   'Doctorado', 'TÍTULO DE DOCTORADO DE EJEMPLO',
   '03/05/2023', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'PENDIENTE']
];

const docentes = MUESTRA.map((f) => {
  const [tipo, doc, n1, n2, a1, a2, nivel, titulo, fecha, pais, ies, estado] = f;
  return {
    documento: doc,
    tipoDocumento: tipo,
    nombreCompleto: [n1, n2, a1, a2].filter(Boolean).join(' '),
    estado,
    tieneValidacion: estado !== 'PENDIENTE',
    estadoRevision: estado === 'VALIDADO'
      ? 'EN_REVISION'
      : estado === 'REQUIERE_CORRECCION' ? 'DEVUELTO' : 'POR_ENVIAR',
    valores: {
      NUM_DOCUMENTO: doc, PRIMER_NOMBRE: n1, SEGUNDO_NOMBRE: n2,
      PRIMER_APELLIDO: a1, SEGUNDO_APELLIDO: a2, NIVEL_ESTUDIO: nivel,
      TITULO: titulo, FECHA_GRADO: fecha, PAIS: pais, IES: ies
    }
  };
});

/* Revisiones ya guardadas, para poder ver el modo consulta y edicion. */
const guardadas = {};

guardadas['DOC-EJ-002'] = {
  criterios: Object.fromEntries(CRITERIOS.map((c) =>
    [c.clave, { valor: 'COINCIDE', correccion: '' }])),
  observaciones: 'Documentación completa y coincidente.',
  urlCarpeta: 'https://drive.google.com/drive/folders/',
  urlActa: 'https://drive.google.com/',
  urlDiploma: 'https://drive.google.com/',
  previewActa: 'about:blank',
  previewDiploma: 'about:blank',
  fechaValidacion: '12/09/2026 09:14',
  fechaModificacion: '12/09/2026 09:14',
  estado: 'VALIDADO',
  estadoRevision: 'EN_REVISION',
  version: 2,
  guardadoPor: 'talento.humano@ejemplo.edu.co',
  enviadoPor: 'talento.humano@ejemplo.edu.co',
  fechaEnvio: '12/09/2026 09:20',
  revisadoPor: '', fechaRevision: '', decisionRevision: '', observacionRevision: '',
  revisionCriterios: Object.fromEntries(CRITERIOS.map((c) =>
    [c.clave, c.clave === 'TITULO' ? 'NO_CONFORME' : 'CONFORME'])),
  revisionCorrecciones: {}
};

guardadas['DOC-EJ-003'] = {
  criterios: Object.fromEntries(CRITERIOS.map((c) => {
    if (c.clave === 'NIVEL_ESTUDIO') {
      return [c.clave, { valor: 'NO_COINCIDE', correccion: 'Maestría' }];
    }
    if (c.clave === 'FECHA_GRADO') {
      return [c.clave, { valor: 'NO_COINCIDE', correccion: '02/12/2020' }];
    }
    return [c.clave, { valor: 'COINCIDE', correccion: '' }];
  })),
  observaciones: 'El acta indica Maestría, no Doctorado. Verificar con el docente.',
  urlCarpeta: 'https://drive.google.com/drive/folders/',
  urlActa: 'https://drive.google.com/',
  urlDiploma: '',
  previewActa: 'about:blank',
  previewDiploma: '',
  fechaValidacion: '14/09/2026 15:32',
  fechaModificacion: '16/09/2026 08:05',
  estado: 'REQUIERE_CORRECCION',
  estadoRevision: 'DEVUELTO',
  version: 3,
  guardadoPor: 'talento.humano@ejemplo.edu.co',
  enviadoPor: 'talento.humano@ejemplo.edu.co',
  fechaEnvio: '14/09/2026 15:40',
  revisadoPor: 'revisor@ejemplo.edu.co',
  fechaRevision: '16/09/2026 08:05',
  decisionRevision: 'DEVUELTO',
  observacionRevision: 'Verificar nivel de estudio y fecha de grado.',
  revisionCriterios: Object.fromEntries(CRITERIOS.map((c) =>
    [c.clave, c.clave === 'NIVEL_ESTUDIO' || c.clave === 'FECHA_GRADO'
      ? 'NO_CONFORME' : 'CONFORME'])),
  revisionCorrecciones: {}
};

/* Ejemplo de documentos ya guardados, todavía pendientes de envío formal. */
guardadas['DOC-EJ-004'] = {
  ...guardadas['DOC-EJ-002'],
  estadoRevision: 'POR_ENVIAR',
  version: 1,
  enviadoPor: '',
  fechaEnvio: '',
  revisadoPor: '',
  fechaRevision: '',
  decisionRevision: '',
  observacionRevision: '',
  revisionCriterios: {},
  revisionCorrecciones: {}
};

/* Ejemplo aprobado, listo para probar la confirmación de Radicado MEN. */
guardadas['DOC-EJ-005'] = {
  ...guardadas['DOC-EJ-003'],
  estadoRevision: 'APROBADO',
  version: 3,
  revisadoPor: 'revisor@ejemplo.edu.co',
  fechaRevision: '18/09/2026 18:43',
  decisionRevision: 'APROBADO',
  observacionRevision: '',
  revisionCriterios: Object.fromEntries(CRITERIOS.map((c) => [c.clave, 'CONFORME'])),
  estadoMen: 'SUBSANACION',
  motivoSubsanacion: 'Actualización del registro externo antes de radicar.',
  fechaSubsanacion: '22/09/2026 08:30',
  fechaDisponibleRadicacion: '23/09/2026',
  subsanacionPor: 'revisor@ejemplo.edu.co',
  radicadoMen: false,
  radicadoPor: '',
  fechaRadicacionMen: ''
};
guardadas['DOC-EJ-006'] = {
  ...guardadas['DOC-EJ-002'],
  estadoRevision: 'APROBADO',
  version: 4,
  revisadoPor: 'revisor@ejemplo.edu.co',
  fechaRevision: '19/09/2026 10:15',
  decisionRevision: 'APROBADO',
  estadoMen: 'RADICADO',
  radicadoMen: true,
  radicadoPor: 'revisor@ejemplo.edu.co',
  fechaRadicacionMen: '20/09/2026 09:30'
};
/* Aprobado y pendiente de radicar: el caso normal del revisor. */
guardadas['DOC-EJ-007'] = {
  ...guardadas['DOC-EJ-002'],
  estadoRevision: 'APROBADO',
  version: 3,
  revisadoPor: 'revisor@ejemplo.edu.co',
  fechaRevision: '21/09/2026 11:05',
  decisionRevision: 'APROBADO',
  observacionRevision: '',
  revisionCriterios: Object.fromEntries(CRITERIOS.map((c) => [c.clave, 'CONFORME'])),
  estadoMen: 'PENDIENTE',
  motivoSubsanacion: '', fechaSubsanacion: '', fechaDisponibleRadicacion: '',
  subsanacionPor: '', radicadoMen: false, radicadoPor: '', fechaRadicacionMen: ''
};

/* Subsanacion ya vencida: el servidor lo promueve solo a LISTO_RADICAR. */
guardadas['DOC-EJ-008'] = {
  ...guardadas['DOC-EJ-007'],
  version: 4,
  fechaRevision: '17/09/2026 09:40',
  estadoMen: 'LISTO_RADICAR',
  motivoSubsanacion: 'Se esperaba la actualización del registro del docente.',
  fechaSubsanacion: '18/09/2026 10:00',
  fechaDisponibleRadicacion: '20/09/2026',
  subsanacionPor: 'revisor@ejemplo.edu.co'
};

const docentePorEnviar = docentes.find((d) => d.documento === 'DOC-EJ-004');
docentePorEnviar.estado = 'VALIDADO';
docentePorEnviar.tieneValidacion = true;
docentePorEnviar.estadoRevision = 'POR_ENVIAR';
const docenteAprobado = docentes.find((d) => d.documento === 'DOC-EJ-005');
docenteAprobado.estado = 'REQUIERE_CORRECCION';
docenteAprobado.tieneValidacion = true;
docenteAprobado.estadoRevision = 'APROBADO';
docenteAprobado.version = 3;
docenteAprobado.estadoMen = 'SUBSANACION';
docenteAprobado.motivoSubsanacion = guardadas['DOC-EJ-005'].motivoSubsanacion;
docenteAprobado.fechaSubsanacion = guardadas['DOC-EJ-005'].fechaSubsanacion;
docenteAprobado.fechaDisponibleRadicacion = guardadas['DOC-EJ-005'].fechaDisponibleRadicacion;
docenteAprobado.radicadoMen = false;
const docenteRadicado = docentes.find((d) => d.documento === 'DOC-EJ-006');
docenteRadicado.estado = 'VALIDADO';
docenteRadicado.tieneValidacion = true;
docenteRadicado.estadoRevision = 'APROBADO';
docenteRadicado.version = 4;
docenteRadicado.estadoMen = 'RADICADO';
docenteRadicado.radicadoMen = true;

/* Los dos casos que faltaban para el tablero y la cola de radicación. */
['DOC-EJ-007', 'DOC-EJ-008'].forEach((documento) => {
  const d = docentes.find((x) => x.documento === documento);
  const g = guardadas[documento];
  Object.assign(d, {
    estado: 'VALIDADO',
    tieneValidacion: true,
    estadoRevision: 'APROBADO',
    version: g.version,
    estadoMen: g.estadoMen,
    motivoSubsanacion: g.motivoSubsanacion,
    fechaSubsanacion: g.fechaSubsanacion,
    fechaDisponibleRadicacion: g.fechaDisponibleRadicacion,
    radicadoMen: false
  });
});

/* ------------------------------------------------------------------
   Servidor simulado
   ------------------------------------------------------------------ */

const simulador = `
<script>
/* Servidor simulado: reproduce el contrato de Code.gs con un retardo
   corto, para que se vean los estados de carga. Nada se guarda. */
(function () {
  var CRITERIOS  = ${JSON.stringify(CRITERIOS)};
  var DOCENTES   = ${JSON.stringify(docentes)};
  var GUARDADAS  = ${JSON.stringify(guardadas)};
  var REQUISITOS = { actaObligatoria: true, diplomaObligatorio: false };
  var PERFIL = {
    correo: 'revisor@ejemplo.edu.co',
    nombre: 'Revisor de ejemplo',
    rol: 'REVISOR',
    roles: ['REVISOR', 'TALENTO_HUMANO']
  };
  var parametrosSimulacion = new URLSearchParams(location.search);
  var rolSimulado = parametrosSimulacion.get('rol');
  if (['TALENTO_HUMANO', 'REVISOR', 'CONSULTA'].indexOf(rolSimulado) !== -1) {
    PERFIL.rol = rolSimulado;
    PERFIL.roles = [rolSimulado];
    PERFIL.correo = rolSimulado.toLowerCase() + '@ejemplo.edu.co';
  }
  var rolActivoSimulado = parametrosSimulacion.get('activo');
  if (PERFIL.roles.indexOf(rolActivoSimulado) !== -1) PERFIL.rol = rolActivoSimulado;

  function resumen() {
    var r = {
      total: DOCENTES.length,
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
    DOCENTES.forEach(function (d) {
      if (d.tieneValidacion === false) r.pendientesCarga++;
      else if (d.estadoRevision === 'EN_REVISION') r.enRevision++;
      else if (d.estadoRevision === 'DEVUELTO') r.devueltos++;
      else if (d.estadoRevision === 'APROBADO') {
        r.aprobados++;
        if (d.radicadoMen || d.estadoMen === 'RADICADO') r.menRadicados++;
        else if (d.estadoMen === 'SUBSANACION') r.menSubsanacion++;
        else if (d.estadoMen === 'LISTO_RADICAR') r.menListos++;
        else r.menPendientes++;
      }
      else r.porEnviar++;
    });
    return r;
  }

  var ACCIONES = {
    obtenerDocentes: function () {
      if (window.SESION && PERFIL.roles.indexOf(SESION.rol) !== -1) {
        PERFIL.rol = SESION.rol;
      }
      if (window.SESION) SESION.correo = PERFIL.correo;
      return {
        auditoria: ${JSON.stringify(NOMBRE_AUDITORIA)},
        criterios: CRITERIOS,
        requisitos: REQUISITOS,
        perfil: PERFIL,
        docentes: DOCENTES,
        resumen: resumen()
      };
    },

    obtenerValidacion: function (documento) {
      var docente = DOCENTES.filter(function (d) { return d.documento === documento; })[0];
      if (!docente) throw new Error('El docente ' + documento + ' no figura en la hoja Docentes.');
      var guardada = GUARDADAS[documento] || null;
      return {
        existe: !!guardada,
        docente: docente,
        validacion: guardada,
        estado: guardada ? guardada.estado : 'PENDIENTE',
        estadoRevision: guardada ? guardada.estadoRevision : 'POR_ENVIAR',
        perfil: PERFIL
      };
    },

    guardarValidacion: function (payload) {
      var estado = 'VALIDADO';
      CRITERIOS.forEach(function (c) {
        var d = payload.criterios[c.clave];
        if (!d || !d.valor) throw new Error('Falta revisar "' + c.etiqueta + '".');
        if (d.valor === 'NO_COINCIDE') {
          if (!d.correccion) throw new Error('Falta la corrección de "' + c.etiqueta + '".');
          if (c.normalizarCorreccion === 'mayusculas') {
            d.correccion = d.correccion.toUpperCase();
          }
          if (c.opcionesCorreccion.length && !c.opcionesCorreccion.includes(d.correccion)) {
            throw new Error('Seleccione un valor permitido para "' + c.etiqueta + '".');
          }
          estado = 'REQUIERE_CORRECCION';
        }
      });

      var previa = GUARDADAS[payload.documento];
      var ahora = new Date().toLocaleString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).replace(',', '');

      if (!payload.acta && !(previa && previa.urlActa)) {
        throw new Error('Debe cargar el acta de grado en formato PDF.');
      }

      GUARDADAS[payload.documento] = {
        criterios: payload.criterios,
        observaciones: payload.observaciones,
        urlCarpeta: 'https://drive.google.com/drive/folders/',
        urlActa: payload.acta ? 'https://drive.google.com/' : (previa ? previa.urlActa : ''),
        urlDiploma: payload.diploma
          ? 'https://drive.google.com/'
          : (payload.quitarDiploma ? '' : (previa ? previa.urlDiploma : '')),
        fechaValidacion: previa ? previa.fechaValidacion : ahora,
        fechaModificacion: ahora,
        estado: estado,
        estadoRevision: previa ? previa.estadoRevision : 'POR_ENVIAR',
        version: previa ? previa.version + 1 : 1,
        guardadoPor: PERFIL.correo,
        enviadoPor: previa ? previa.enviadoPor : '',
        fechaEnvio: previa ? previa.fechaEnvio : '',
        revisadoPor: previa ? previa.revisadoPor : '',
        fechaRevision: previa ? previa.fechaRevision : '',
        decisionRevision: previa ? previa.decisionRevision : '',
        observacionRevision: previa ? previa.observacionRevision : '',
        estadoMen: previa ? previa.estadoMen : 'PENDIENTE',
        motivoSubsanacion: previa ? previa.motivoSubsanacion : '',
        fechaSubsanacion: previa ? previa.fechaSubsanacion : '',
        fechaDisponibleRadicacion: previa ? previa.fechaDisponibleRadicacion : '',
        subsanacionPor: previa ? previa.subsanacionPor : '',
        radicadoMen: previa ? previa.radicadoMen : false,
        radicadoPor: previa ? previa.radicadoPor : '',
        fechaRadicacionMen: previa ? previa.fechaRadicacionMen : '',
        revisionCriterios: previa ? previa.revisionCriterios : {},
        revisionCorrecciones: previa ? previa.revisionCorrecciones : {}
      };

      DOCENTES.forEach(function (d) {
        if (d.documento === payload.documento) {
          d.estado = estado;
          d.tieneValidacion = true;
          d.estadoRevision = GUARDADAS[payload.documento].estadoRevision;
        }
      });

      return {
        documento: payload.documento,
        estado: estado,
        validacion: GUARDADAS[payload.documento],
        resumen: resumen()
      };
    },

    enviarARevision: function (payload) {
      var v = GUARDADAS[payload.documento];
      if (!v) throw new Error('Primero debe guardar la validación.');
      v.estadoRevision = 'EN_REVISION';
      v.version++;
      v.enviadoPor = PERFIL.correo;
      DOCENTES.forEach(function (d) {
        if (d.documento === payload.documento) d.estadoRevision = 'EN_REVISION';
      });
      return { documento: payload.documento, estadoRevision: 'EN_REVISION', version: v.version, resumen: resumen() };
    },

    decidirRevision: function (payload) {
      var v = GUARDADAS[payload.documento];
      if (!v) throw new Error('No existe una validación para revisar.');
      var estado = v.estado;
      v.revisionCriterios = {};
      v.revisionCorrecciones = {};
      CRITERIOS.forEach(function (c) {
        var recibido = payload.criterios[c.clave];
        v.revisionCriterios[c.clave] = recibido.valor;
        v.revisionCorrecciones[c.clave] = recibido.correccion || '';
        if (payload.decision === 'APROBADO' && recibido.valor === 'NO_CONFORME') {
          if (!recibido.correccion) throw new Error('Indique el valor correcto para "' + c.etiqueta + '".');
          v.criterios[c.clave] = { valor: 'NO_COINCIDE', correccion: recibido.correccion };
          estado = 'REQUIERE_CORRECCION';
        }
      });
      v.estadoRevision = payload.decision;
      v.estado = estado;
      v.decisionRevision = payload.decision;
      v.observacionRevision = payload.observacion;
      v.revisadoPor = PERFIL.correo;
      v.estadoMen = payload.decision === 'APROBADO' ? 'PENDIENTE' : '';
      v.version++;
      DOCENTES.forEach(function (d) {
        if (d.documento === payload.documento) {
          d.estadoRevision = payload.decision;
          d.estado = estado;
          d.version = v.version;
          d.estadoMen = v.estadoMen;
        }
      });
      return { documento: payload.documento, estado: estado, estadoRevision: payload.decision, estadoMen: v.estadoMen, version: v.version, resumen: resumen() };
    },

    ponerEnSubsanacion: function (payload) {
      var v = GUARDADAS[payload.documento];
      if (!v || v.estadoRevision !== 'APROBADO' || v.radicadoMen) {
        throw new Error('Solo se puede poner en subsanación un aprobado no radicado.');
      }
      v.estadoMen = 'SUBSANACION';
      v.motivoSubsanacion = payload.motivo;
      v.fechaSubsanacion = '22/09/2026 09:40';
      v.fechaDisponibleRadicacion = payload.fechaDisponible.split('-').reverse().join('/');
      v.subsanacionPor = PERFIL.correo;
      v.version++;
      var d = DOCENTES.find(function (item) { return item.documento === payload.documento; });
      Object.assign(d, {
        version: v.version,
        estadoMen: v.estadoMen,
        motivoSubsanacion: v.motivoSubsanacion,
        fechaSubsanacion: v.fechaSubsanacion,
        fechaDisponibleRadicacion: v.fechaDisponibleRadicacion,
        subsanacionPor: v.subsanacionPor
      });
      return {
        documento: payload.documento, version: v.version, estadoMen: v.estadoMen,
        motivoSubsanacion: v.motivoSubsanacion, fechaSubsanacion: v.fechaSubsanacion,
        fechaDisponibleRadicacion: v.fechaDisponibleRadicacion,
        subsanacionPor: v.subsanacionPor, resumen: resumen()
      };
    },

    obtenerInformeGestion: function (payload) {
      // El historial abarca dos meses para poder comprobar que el rango de
      // fechas mueve los bloques C, D y F pero NO el bloque B (estado a hoy).
      var TH = 'talento.humano@ejemplo.edu.co';
      var TH2 = 'auxiliar.talento@ejemplo.edu.co';
      var REV = 'revisor@ejemplo.edu.co';

      var historial = [
        ['05/08/2026 09:12', 'DOC-EJ-002', 'GUARDADO', '', 'POR_ENVIAR', TH, 'TALENTO_HUMANO', ''],
        ['05/08/2026 09:40', 'DOC-EJ-002', 'ENVIADO_A_REVISION', 'POR_ENVIAR', 'EN_REVISION', TH, 'TALENTO_HUMANO', ''],
        ['07/08/2026 14:03', 'DOC-EJ-003', 'GUARDADO', '', 'POR_ENVIAR', TH2, 'TALENTO_HUMANO', ''],
        ['07/08/2026 14:25', 'DOC-EJ-003', 'ENVIADO_A_REVISION', 'POR_ENVIAR', 'EN_REVISION', TH2, 'TALENTO_HUMANO', ''],
        ['12/08/2026 10:18', 'DOC-EJ-003', 'DEVUELTO', 'EN_REVISION', 'DEVUELTO', REV, 'REVISOR', 'Verificar nivel de estudio y fecha de grado.'],
        ['14/08/2026 08:55', 'DOC-EJ-004', 'GUARDADO', '', 'POR_ENVIAR', TH, 'TALENTO_HUMANO', ''],
        ['02/09/2026 11:30', 'DOC-EJ-005', 'ENVIADO_A_REVISION', 'POR_ENVIAR', 'EN_REVISION', TH2, 'TALENTO_HUMANO', ''],
        ['08/09/2026 16:44', 'DOC-EJ-005', 'APROBADO', 'EN_REVISION', 'APROBADO', REV, 'REVISOR', ''],
        ['12/09/2026 09:14', 'DOC-EJ-006', 'GUARDADO', '', 'POR_ENVIAR', TH, 'TALENTO_HUMANO', ''],
        ['15/09/2026 10:02', 'DOC-EJ-006', 'APROBADO_CON_CORRECCION_REVISOR', 'EN_REVISION', 'APROBADO', REV, 'REVISOR', 'Se ajustó el título según el acta.'],
        ['17/09/2026 09:40', 'DOC-EJ-008', 'APROBADO', 'EN_REVISION', 'APROBADO', REV, 'REVISOR', ''],
        ['18/09/2026 10:00', 'DOC-EJ-008', 'SUBSANACION_MEN', 'PENDIENTE', 'SUBSANACION', REV, 'REVISOR', 'Se esperaba la actualización del registro del docente.'],
        ['20/09/2026 09:30', 'DOC-EJ-006', 'RADICADO_MEN', 'PENDIENTE', 'RADICADO', REV, 'REVISOR', ''],
        ['21/09/2026 11:05', 'DOC-EJ-007', 'APROBADO', 'EN_REVISION', 'APROBADO', REV, 'REVISOR', ''],
        ['22/09/2026 08:30', 'DOC-EJ-005', 'SUBSANACION_MEN', 'PENDIENTE', 'SUBSANACION', REV, 'REVISOR', 'Actualización del registro externo antes de radicar.']
      ].map(function (f) {
        var d = DOCENTES.filter(function (x) { return x.documento === f[1]; })[0];
        return {
          fecha: f[0], documento: f[1], docente: d ? d.nombreCompleto : f[1],
          evento: f[2], estadoAnterior: f[3], estadoNuevo: f[4],
          correo: f[5], rol: f[6], observacion: f[7]
        };
      });

      // El filtro por fechas es el mismo que aplica el servidor: solo al
      // historial y al agregado por usuario, nunca al estado de hoy.
      var dia = function (texto) {
        var p = String(texto || '').slice(0, 10).split('/');
        return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null;
      };
      var desde = payload && payload.desde ? new Date(payload.desde + 'T00:00:00') : null;
      var hasta = payload && payload.hasta ? new Date(payload.hasta + 'T23:59:59') : null;

      var enRango = historial.filter(function (h) {
        var f = dia(h.fecha);
        if (!f) return true;
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
        return true;
      });

      var porUsuario = {};
      enRango.forEach(function (h) {
        var clave = h.correo + '|' + h.rol;
        if (!porUsuario[clave]) {
          porUsuario[clave] = { correo: h.correo, rol: h.rol, total: 0, eventos: {} };
        }
        porUsuario[clave].total++;
        porUsuario[clave].eventos[h.evento] = (porUsuario[clave].eventos[h.evento] || 0) + 1;
      });

      return {
        generado: '22/09/2026 09:45',
        desde: payload ? payload.desde : '',
        hasta: payload ? payload.hasta : '',
        resumen: resumen(),
        usuarios: Object.keys(porUsuario).map(function (k) { return porUsuario[k]; }),
        registros: DOCENTES.map(function (d) {
          var v = GUARDADAS[d.documento] || {};
          return Object.assign({ documento: d.documento, docente: d.nombreCompleto }, v);
        }),
        historial: enRango
      };
    },

    confirmarRadicadoMen: function (payload) {
      var v = GUARDADAS[payload.documento];
      if (!v || v.estadoRevision !== 'APROBADO') {
        throw new Error('Solo se puede confirmar el radicado MEN de una revisión aprobada.');
      }
      v.radicadoMen = true;
      v.estadoMen = 'RADICADO';
      v.radicadoPor = PERFIL.correo;
      v.fechaRadicacionMen = '21/09/2026 11:45';
      v.version++;
      DOCENTES.forEach(function (d) {
        if (d.documento === payload.documento) {
          d.version = v.version;
          d.radicadoMen = true;
          d.estadoMen = 'RADICADO';
          d.radicadoPor = v.radicadoPor;
          d.fechaRadicacionMen = v.fechaRadicacionMen;
        }
      });
      return {
        documento: payload.documento,
        version: v.version,
        estadoMen: 'RADICADO',
        radicadoMen: true,
        radicadoPor: v.radicadoPor,
        fechaRadicacionMen: v.fechaRadicacionMen,
        resumen: resumen()
      };
    }
  };

  /* La pagina llama a window.SIMULADOR cuando existe, en lugar de
     hacer fetch al servidor de Apps Script. Mismo contrato: el fallo
     recibe un texto. */
  window.SIMULADOR = function (accion, argumento, exito, fallo) {
    setTimeout(function () {
      try {
        exito(ACCIONES[accion](argumento));
      } catch (e) {
        fallo(e.message);
      }
    }, 350);
  };

  /* Para QA visual: abrir vista_previa.html#DOC-EJ-002 lleva directo a
     la ficha una vez cargado el listado. */
  window.addEventListener('load', function () {
    var documento = String(location.hash || '').replace(/^#/, '');
    if (documento) setTimeout(function () { abrirFicha(documento); }, 900);
    if (!documento && parametrosSimulacion.get('filtro') === 'APROBADO') {
      setTimeout(function () { aplicarFiltro('APROBADO'); }, 900);
    }
  });
})();
<\/script>
`;

/* ------------------------------------------------------------------
   Montaje
   ------------------------------------------------------------------ */

let pagina = leer('Index.html');

pagina = pagina
  .split('<!--LOGO-->').join(leer('Logo.html'))
  .replace('<!--ESTILOS-->', leer('Styles.html'))
  .replace('<!--SCRIPTS-->', simulador + leer('Scripts.html'));

for (const marcador of ['<!--LOGO-->', '<!--ESTILOS-->', '<!--SCRIPTS-->']) {
  if (pagina.includes(marcador)) {
    throw new Error('Quedo sin reemplazar el marcador ' + marcador + '.');
  }
}

// La clase solo-pantalla la esconde el bloque @media print de Styles.html:
// al probar la impresion del tablero, este banner no debe salir en el papel.
const aviso = `
<div class="solo-pantalla"
     style="max-width:1140px;margin:0 auto;padding:10px 24px;font:13px/1.5 system-ui;
            color:#8A6100;background:#FFF6E0;border-bottom:1px solid #F0DCA8;">
  <strong>Vista previa.</strong> Datos de muestra y servidor simulado: nada se guarda
  en la hoja de cálculo ni en Drive.
</div>`;

pagina = pagina.replace('<body>', '<body>' + aviso);

writeFileSync(join(raiz, 'vista_previa.html'), pagina, 'utf8');
console.log('vista_previa.html generado (' + Math.round(pagina.length / 1024) + ' KB)');
