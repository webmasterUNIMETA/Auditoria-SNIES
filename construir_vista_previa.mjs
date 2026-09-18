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
   '11/03/2020', 'Colombia', 'INSTITUCIÓN UNIVERSITARIA DE EJEMPLO', 'PENDIENTE']
];

const docentes = MUESTRA.map((f) => {
  const [tipo, doc, n1, n2, a1, a2, nivel, titulo, fecha, pais, ies, estado] = f;
  return {
    documento: doc,
    tipoDocumento: tipo,
    nombreCompleto: [n1, n2, a1, a2].filter(Boolean).join(' '),
    estado,
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
  fechaValidacion: '12/09/2026 09:14',
  fechaModificacion: '12/09/2026 09:14',
  estado: 'VALIDADO'
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
  fechaValidacion: '14/09/2026 15:32',
  fechaModificacion: '16/09/2026 08:05',
  estado: 'REQUIERE_CORRECCION'
};

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

  function resumen() {
    var r = { total: DOCENTES.length, pendientes: 0, validados: 0, correcciones: 0 };
    DOCENTES.forEach(function (d) {
      if (d.estado === 'VALIDADO') r.validados++;
      else if (d.estado === 'REQUIERE_CORRECCION') r.correcciones++;
      else r.pendientes++;
    });
    return r;
  }

  var ACCIONES = {
    obtenerDocentes: function () {
      return {
        auditoria: ${JSON.stringify(NOMBRE_AUDITORIA)},
        criterios: CRITERIOS,
        requisitos: REQUISITOS,
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
        estado: guardada ? guardada.estado : 'PENDIENTE'
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
        estado: estado
      };

      DOCENTES.forEach(function (d) {
        if (d.documento === payload.documento) d.estado = estado;
      });

      return {
        documento: payload.documento,
        estado: estado,
        validacion: GUARDADAS[payload.documento],
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

const aviso = `
<div style="max-width:1140px;margin:0 auto;padding:10px 24px;font:13px/1.5 system-ui;
            color:#8A6100;background:#FFF6E0;border-bottom:1px solid #F0DCA8;">
  <strong>Vista previa.</strong> Datos de muestra y servidor simulado: nada se guarda
  en la hoja de cálculo ni en Drive.
</div>`;

pagina = pagina.replace('<body>', '<body>' + aviso);

writeFileSync(join(raiz, 'vista_previa.html'), pagina, 'utf8');
console.log('vista_previa.html generado (' + Math.round(pagina.length / 1024) + ' KB)');
