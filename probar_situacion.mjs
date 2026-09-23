import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const archivo = readFileSync(new URL('./Scripts.html', import.meta.url), 'utf8');
const fin = archivo.indexOf('/* MODELO:FIN */');
assert.notEqual(fin, -1, 'Falta el marcador MODELO:FIN en Scripts.html');

const contexto = {};
vm.createContext(contexto);
vm.runInContext(
  archivo.slice(archivo.indexOf("'use strict';"), fin),
  contexto,
  { filename: 'Scripts.html:modelo' }
);

const casos = [
  ['SIN_CARGAR', {}, 'CAPTURA', 'TALENTO_HUMANO'],
  ['BORRADOR', { tieneValidacion: true, estadoRevision: 'POR_ENVIAR' }, 'CAPTURA', 'TALENTO_HUMANO'],
  ['DEVUELTO', { tieneValidacion: true, estadoRevision: 'DEVUELTO' }, 'CAPTURA', 'TALENTO_HUMANO'],
  ['EN_REVISION', { tieneValidacion: true, estadoRevision: 'EN_REVISION' }, 'REVISION', 'REVISOR'],
  ['POR_RADICAR', { tieneValidacion: true, estadoRevision: 'APROBADO', estadoMen: 'PENDIENTE' }, 'MEN', 'REVISOR'],
  ['EN_SUBSANACION', { tieneValidacion: true, estadoRevision: 'APROBADO', estadoMen: 'SUBSANACION' }, 'MEN', 'NADIE'],
  ['LISTO_RADICAR', { tieneValidacion: true, estadoRevision: 'APROBADO', estadoMen: 'LISTO_RADICAR' }, 'MEN', 'REVISOR'],
  ['RADICADO', { tieneValidacion: true, estadoRevision: 'APROBADO', estadoMen: 'RADICADO' }, 'SNIES', 'REVISOR'],
  ['CONFIRMADO', { tieneValidacion: true, estadoRevision: 'APROBADO', estadoMen: 'SINCRONIZADO' }, 'CERRADO', 'NADIE'],
  ['SIN_NOVEDAD', { tieneValidacion: true, estadoRevision: 'APROBADO', estadoMen: 'SIN_NOVEDAD' }, 'CERRADO', 'NADIE']
];

for (const [clave, expediente, fase, actor] of casos) {
  const situacion = contexto.situacion(expediente, actor);
  assert.equal(situacion.clave, clave, clave);
  assert.equal(situacion.fase, fase, `${clave}: fase`);
  assert.equal(situacion.actor, actor, `${clave}: actor`);
  assert.equal(contexto.pestanaDe(situacion, 'CONSULTA'), fase === 'CERRADO' ? 'CERRADOS' : 'OTRAS');
  if (actor !== 'NADIE') assert.equal(contexto.pestanaDe(situacion, actor), 'MIA', `${clave}: bandeja propia`);
}

assert.equal(contexto.claveSituacion({ revisado: true, estadoRevision: 'EN_REVISION' }), 'EN_REVISION');
assert.equal(contexto.claveSituacion({
  tieneValidacion: true,
  estadoRevision: 'APROBADO',
  radicadoMen: true
}), 'RADICADO');

const conteo = contexto.contarFases(casos.map(([, expediente]) => contexto.situacion(expediente, 'CONSULTA')));
assert.deepEqual(
  JSON.parse(JSON.stringify(conteo)),
  { CAPTURA: 3, REVISION: 1, MEN: 3, SNIES: 1, CERRADO: 2 }
);

console.log('situacion(): 10 situaciones y 5 fases verificadas');
