# Migración a GitHub Pages con inicio de sesión de Google

Guía de instalación. Son cuatro pasos y hay que hacerlos **en este orden**:
la aplicación no funciona hasta que los cuatro estén completos.

> **No cree una versión nueva del despliegue hasta terminar el paso 4.**
> Mientras tanto, la versión publicada sigue funcionando como antes.

---

## Cómo queda la arquitectura

```
  Navegador                      GitHub Pages            Apps Script
 ┌──────────┐   carga la app    ┌────────────┐          ┌──────────────┐
 │  Talento │ ────────────────► │ index.html │          │   Api.gs     │
 │  Humano  │                   └────────────┘          │   doPost()   │
 │          │                                           │      │       │
 │          │   1. inicia sesión con Google              │      ▼       │
 │          │ ◄──── token firmado ──────────────┐        │ verifica el  │
 │          │                                   │        │    token     │
 │          │   2. POST { token, accion, ... }  │        │      │       │
 │          │ ─────────────────────────────────────────► │      ▼       │
 │          │ ◄──────────── JSON ──────────────────────  │  Code.gs     │
 └──────────┘                                            │ Sheets+Drive │
                                                         └──────────────┘
```

**Qué protege los datos.** El despliegue queda abierto (es la única forma de
que un navegador pueda llamarlo desde otro dominio), pero la aplicación no.
Cada petición lleva el token que Google emite al iniciar sesión, y el servidor
lo verifica **contra Google** antes de mirar siquiera qué se le está pidiendo.
Comprueba cuatro cosas: que la firma sea auténtica y esté vigente, que el token
se haya emitido para esta aplicación, que el correo esté verificado y que
pertenezca al dominio institucional.

Sin token válido no se responde nada. Quien encuentre la URL `/exec` y la abra
en el navegador recibe un aviso de texto y punto.

**Por qué la página ya no la sirve Apps Script.** Toda página servida con
`HtmlService` trae consigo `google.script.run`, que permite invocar *cualquier*
función pública del proyecto. Con el despliegue abierto eso sería una puerta
trasera a `crearCarpetasDocentes`, `consolidarCarpetas` y a los datos de los 50
docentes. Por eso `Index.html`, `Styles.html`, `Scripts.html` y `Logo.html`
están en `.claspignore`: **no deben subir nunca al proyecto de Apps Script.**

---

## Paso 1 · Publicar el sitio en GitHub Pages

Necesita la URL antes de crear el client ID, así que va primero.

El repositorio es **`webmasterUNIMETA/Auditoria-SNIES`**.

> **La rama no aparece en *Settings -> Pages* hasta que el repositorio tiene
> al menos un commit.** GitHub no puede ofrecer una rama que todavía no
> existe. Por eso primero se sube el código y después se activa Pages.

1. Cree el repositorio en GitHub si aún no existe.
   - En cuenta gratuita debe ser **público** para que Pages funcione. Lo que
     se publica es solo la interfaz: ni un dato de docente viaja ahí, todos
     viven en Sheets y Drive detrás del inicio de sesión.
2. Suba el código:

   ```bash
   cd "C:\Users\ANALISTA DE SISTEMAS\Desktop\AUDITORIA SNIES"
   git push -u origin main
   ```

3. Ahora sí, en *Settings -> Pages*: **Deploy from a branch**, rama `main`,
   carpeta **`/docs`**.

   > Tiene que ser `/docs`. GitHub Pages solo sabe servir desde la raíz del
   > repositorio o desde una carpeta llamada exactamente así; por eso
   > `construir_sitio.mjs` genera ahí.

4. La URL queda:

```
https://webmasterunimeta.github.io/Auditoria-SNIES/
```

---

## Paso 2 · Crear el identificador de cliente de Google

1. Abra **https://console.cloud.google.com/apis/credentials** con la cuenta
   institucional administradora del proyecto.
2. Seleccione (o cree) un proyecto de Google Cloud.
3. Configure primero la **pantalla de consentimiento de OAuth**:
   - Tipo de usuario: **Interno**. Así solo pueden entrar cuentas
     `@unimeta.edu.co` y Google no exige verificación de la aplicación.
   - Nombre: `Validación documental de docentes`.
4. Vuelva a *Credenciales* → **Crear credenciales → ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - **Orígenes autorizados de JavaScript**:

     ```
     https://webmasterunimeta.github.io
     ```

     > Es el **origen**, no la ruta completa: solo esquema y dominio, sin
     > `/Auditoria-SNIES` y sin barra final. Si pone la ruta completa, el
     > botón de Google no aparece.
5. Copie el **ID de cliente**. Tiene esta forma:

   ```
   1234567890-abcdefghijk.apps.googleusercontent.com
   ```

Ese identificador **es público por diseño** — viaja en toda página que use
inicio de sesión de Google. No es una contraseña y no hay que ocultarlo. Quien
protege los datos es la verificación del servidor.

---

## Paso 3 · Configurar y generar el sitio

### 3.1 · Añadir tres parámetros a la hoja `Configuracion`

| PARAMETRO | VALOR |
|---|---|
| `ID_CLIENTE_OAUTH` | el ID de cliente del paso 2 |
| `DOMINIO_AUTORIZADO` | `unimeta.edu.co` |
| `URL_SITIO` | `https://webmasterunimeta.github.io/Auditoria-SNIES/` |

- `ID_CLIENTE_OAUTH` es lo que permite al servidor comprobar que el token fue
  emitido **para esta aplicación** y no para cualquier otra de Google.
- `DOMINIO_AUTORIZADO` es el primer cerrojo: si lo deja vacío, se pierde el
  filtro institucional de Google.
- La autorización definitiva se toma de la hoja privada `Usuarios`. Solo entran
  las cuentas con `ACTIVO = SI` y rol `TALENTO_HUMANO`, `REVISOR` o `CONSULTA`.
  Una cuenta institucional que no figure allí recibe acceso denegado.
- `URL_SITIO` solo se usa para el aviso que ve quien abre la `/exec` a mano.

### 3.2 · Rellenar `sitio.config.json`

```json
{
  "URL_SERVIDOR": "https://script.google.com/macros/s/AKfy.../exec",
  "ID_CLIENTE_OAUTH": "1234567890-abcdefghijk.apps.googleusercontent.com"
}
```

La `URL_SERVIDOR` es la del despliegue (paso 4). Si aún no la tiene, complete
el paso 4 y vuelva aquí.

### 3.3 · Generar

```bash
node construir_sitio.mjs
```

Produce `docs/index.html`: un único archivo con todo dentro. Súbalo:

```bash
git add docs && git commit -m "Publica el sitio" && git push
```

> Repita `node construir_sitio.mjs` y vuelva a subir `docs/` **cada vez**
> que cambie `Index.html`, `Styles.html`, `Scripts.html` o `Logo.html`.

---

## Paso 4 · Republicar el servidor

En el editor de Apps Script:

*Implementar → Gestionar implementaciones → (lápiz) → Versión: Nueva versión*

| Campo | Valor |
|---|---|
| Ejecutar como | **Yo** |
| Quién tiene acceso | **Cualquier usuario** |

> **«Cualquier usuario» da miedo, y conviene entender por qué es correcto
> aquí.** Es lo que permite que el navegador llame al servidor desde
> github.io; sin eso, Google responde con una redirección al login que
> `fetch` no puede seguir. Lo que queda abierto es la *puerta*, no la
> *caja fuerte*: `doPost` rechaza toda petición sin un token válido del
> dominio institucional. Si `ID_CLIENTE_OAUTH` faltara en la hoja, el
> servidor tampoco respondería nada: falla cerrado, no abierto.

La URL `/exec` se mantiene igual que antes. Cópiela a `sitio.config.json` si
todavía no lo hizo y regenere el sitio.

---

## Comprobación

1. Abra la URL de GitHub Pages en una ventana de incógnito.
2. Debe aparecer la pantalla de acceso con el botón de Google, **sin datos
   de ningún docente detrás**.
3. Inicie sesión con una cuenta `@unimeta.edu.co` → entra a la aplicación y su
   correo aparece arriba a la derecha.
4. Pruebe con una cuenta `@gmail.com` → debe rechazarla con el mensaje
   *«Esta aplicación es de uso interno…»*.
5. Abra la URL `/exec` directamente en el navegador → solo el aviso de texto.

Para la prueba definitiva, abra las herramientas de desarrollador y ejecute:

```js
fetch(URL_SERVIDOR, { method: 'POST', body: '{"accion":"obtenerDocentes"}' })
  .then(r => r.json()).then(console.log)
```

Debe responder `{ ok: false, sesion: "INVALIDA", ... }` y **ningún dato**.

---

## Si algo falla

| Síntoma | Causa |
|---|---|
| El botón de Google no aparece | El origen de la página no está en *Orígenes autorizados de JavaScript*. Debe ser solo esquema y dominio, sin ruta ni barra final |
| `La sesión no corresponde a esta aplicación` | El `ID_CLIENTE_OAUTH` de la hoja no es el mismo que el de `sitio.config.json` |
| `Esta aplicación es de uso interno` con cuenta institucional | Revise `DOMINIO_AUTORIZADO`: debe ser `unimeta.edu.co`, sin `@` ni `https://` |
| `Falta el parámetro ID_CLIENTE_OAUTH` | No se añadió la fila a la hoja `Configuracion` |
| Todo falla con error de conexión | La `URL_SERVIDOR` acaba en `/dev` en vez de `/exec`, o el despliegue no es «Cualquier usuario» |

---

## Volver atrás

La arquitectura anterior sigue en el historial de versiones de Apps Script.
Para regresar: *Implementar → Gestionar implementaciones → Versión → elija una
anterior*. Los archivos locales de esa versión están en git; la única pieza que
habría que reponer es el `doGet` que servía la página con `HtmlService`.
