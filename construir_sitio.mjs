/**
 * construir_sitio.mjs
 *
 * Arma docs/index.html: la aplicacion en un unico archivo, listo para
 * publicar en GitHub Pages.
 *
 *   Index.html + Styles.html + Scripts.html + Logo.html  ->  docs/index.html
 *
 * Uso:  node construir_sitio.mjs
 *
 * Los dos datos que dependen de la instalacion (la URL del servidor de
 * Apps Script y el identificador de cliente de Google) se leen de
 * sitio.config.json y se inyectan como variables de window. No se
 * escriben a mano en el HTML para no tener que recordar cambiarlos.
 *
 * NADA SECRETO VIAJA AQUI. El identificador de cliente de OAuth es
 * publico por diseno: va en toda pagina que use inicio de sesion de
 * Google. Quien protege los datos es el servidor, que verifica el token
 * contra Google en cada peticion (ver Api.gs).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = dirname(fileURLToPath(import.meta.url));
const leer = (nombre) => readFileSync(join(raiz, nombre), 'utf8');

/* ------------------------------------------------------------------
   Configuracion
   ------------------------------------------------------------------ */

const RUTA_CONFIG = join(raiz, 'sitio.config.json');

if (!existsSync(RUTA_CONFIG)) {
  console.error(
    'Falta sitio.config.json.\n\n' +
    'Cree el archivo junto a este script con esta forma:\n\n' +
    '{\n' +
    '  "URL_SERVIDOR": "https://script.google.com/macros/s/AKfy.../exec",\n' +
    '  "ID_CLIENTE_OAUTH": "1234567890-abc.apps.googleusercontent.com"\n' +
    '}\n'
  );
  process.exit(1);
}

const config = JSON.parse(readFileSync(RUTA_CONFIG, 'utf8'));

for (const clave of ['URL_SERVIDOR', 'ID_CLIENTE_OAUTH']) {
  if (!config[clave] || String(config[clave]).trim() === '') {
    console.error('sitio.config.json: falta el valor de ' + clave + '.');
    process.exit(1);
  }
}

if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.URL_SERVIDOR)) {
  console.error(
    'URL_SERVIDOR no parece una URL de aplicacion web de Apps Script.\n' +
    'Debe terminar en /exec, no en /dev:\n  ' + config.URL_SERVIDOR
  );
  process.exit(1);
}

if (!/\.apps\.googleusercontent\.com$/.test(config.ID_CLIENTE_OAUTH)) {
  console.error(
    'ID_CLIENTE_OAUTH deberia terminar en .apps.googleusercontent.com:\n  ' +
    config.ID_CLIENTE_OAUTH
  );
  process.exit(1);
}

/* ------------------------------------------------------------------
   Montaje
   ------------------------------------------------------------------ */

const ajustes =
  '<script>\n' +
  '/* Generado por construir_sitio.mjs. No editar a mano. */\n' +
  'window.URL_SERVIDOR = ' + JSON.stringify(config.URL_SERVIDOR) + ';\n' +
  'window.ID_CLIENTE_OAUTH = ' + JSON.stringify(config.ID_CLIENTE_OAUTH) + ';\n' +
  '<\/script>\n' +
  '<script src="https://accounts.google.com/gsi/client" defer><\/script>\n';

const logo = leer('Logo.html');
let pagina = leer('Index.html');

// El logo aparece dos veces: en la puerta de entrada y en el encabezado.
pagina = pagina
  .split('<!--LOGO-->').join(logo)
  .replace('<!--ESTILOS-->', leer('Styles.html'))
  .replace('<!--SCRIPTS-->', ajustes + leer('Scripts.html'));

for (const marcador of ['<!--LOGO-->', '<!--ESTILOS-->', '<!--SCRIPTS-->']) {
  if (pagina.includes(marcador)) {
    console.error('Quedo sin reemplazar el marcador ' + marcador + ' en Index.html.');
    process.exit(1);
  }
}

if (pagina.includes('<?')) {
  console.error('Index.html todavia tiene plantillas de Apps Script (<? ... ?>).');
  process.exit(1);
}

// docs/ y no sitio/: GitHub Pages solo sabe servir desde la raiz del
// repositorio o desde una carpeta llamada exactamente docs.
const destino = join(raiz, 'docs');
mkdirSync(destino, { recursive: true });
writeFileSync(join(destino, 'index.html'), pagina, 'utf8');

// GitHub Pages ignora por defecto lo que empieza por guion bajo; este
// archivo desactiva ese procesado y evita sorpresas.
writeFileSync(join(destino, '.nojekyll'), '', 'utf8');

console.log(
  'docs/index.html generado (' + Math.round(pagina.length / 1024) + ' KB)\n' +
  '  servidor: ' + config.URL_SERVIDOR + '\n' +
  '  cliente:  ' + config.ID_CLIENTE_OAUTH
);
