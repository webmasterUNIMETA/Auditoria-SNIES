# Despliegue — Validación documental de docentes

Aplicación web de Google Apps Script para la auditoría SNIES 2026-1.

---

## 1. Archivos del proyecto

| Archivo | Qué contiene |
|---|---|
| `appsscript.json` | Manifiesto: zona horaria, permisos y publicación de la web app |
| `Code.gs` | Todo el servidor: configuración, hojas, Drive, estados y las tres acciones |
| `Index.html` | Estructura de la página (listado + ficha) |
| `Styles.html` | Sistema visual completo, centralizado en `:root` |
| `Scripts.html` | Lógica del navegador |
| `Logo.html` | Logotipo UNIMETA embebido como data URI |

Los cuatro `.html` se incrustan dentro de `Index.html`; en Apps Script deben
crearse como archivos **HTML**, no como `.gs`.

---

## 2. Antes de subir: la hoja de cálculo

El proyecto debe estar **enlazado a la hoja de cálculo** de la auditoría
(*Extensiones → Apps Script* desde el propio libro). Si prefiere un proyecto
suelto, defina la propiedad de script `ID_HOJA_CALCULO` con el identificador
del libro.

### Hoja `Configuracion`

Encabezados `PARAMETRO` / `VALOR` en la fila 1. Parámetros que lee la aplicación:

| PARAMETRO | Ejemplo | Efecto |
|---|---|---|
| `NOMBRE_AUDITORIA` | `Auditoría Docentes 2026-1` | Rótulo de la cinta superior |
| `ID_CARPETA_PRINCIPAL_DRIVE` | `<ID_DE_LA_CARPETA>` | Carpeta donde se crean las subcarpetas por docente |
| `CARPETA_ACTAS_OBLIGATORIA` | `SI` | Si es `SI`, no se puede guardar sin acta de grado |
| `DIPLOMA_OBLIGATORIO` | `NO` | Si es `NO`, el diploma es opcional |

> `ID_CARPETA_PRINCIPAL_DRIVE` **nunca** se envía al navegador.

### Hoja `Docentes`

Solo lectura. La aplicación **jamás la escribe**. Localiza las columnas por su
encabezado, así que el orden puede cambiar sin romper nada.

### Hoja `Validaciones`

**No hay que crearla a mano.** La aplicación la crea con sus 31 columnas la
primera vez que se abre la página, y si en el futuro falta alguna columna la
agrega al final sin tocar lo existente.

---

## 3. Subir el código

### Con clasp

```bash
cd "C:\Users\ANALISTA DE SISTEMAS\Desktop\AUDITORIA SNIES"
clasp login
clasp clone <ID_DEL_PROYECTO>   # solo la primera vez; conserve los archivos locales
clasp push
```

`clasp push` convierte `Code.gs` en script y los `.html` en archivos HTML
automáticamente.

### A mano, desde el editor

1. Abra el proyecto de Apps Script.
2. Active *Configuración del proyecto → Mostrar el archivo de manifiesto
   `appsscript.json`* y pegue el contenido del archivo local.
3. Cree o reemplace `Code.gs` con el contenido local.
4. Cree cuatro archivos **HTML** llamados exactamente `Index`, `Styles`,
   `Scripts` y `Logo`, y pegue el contenido de cada uno.
5. Guarde.

---

## 4. Funciones de mantenimiento

Se ejecutan **desde el editor** de Apps Script, nunca desde la página. Ninguna
es necesaria para el uso diario.

| Función | Qué hace | ¿Modifica algo? |
|---|---|---|
| `prepararAuditoria` | Crea la hoja `Validaciones` y comprueba configuración y carpeta de Drive | Crea la hoja si falta |
| `inspeccionarDrive` | Muestra el árbol de carpetas, dos niveles, con IDs y archivos | No |
| `revisarCarpetas` | Informa qué carpetas no siguen el patrón `NÚMERO - NOMBRE` y qué contienen | No |
| `crearCarpetasDocentes` | Crea de una vez la carpeta de cada docente de la hoja | Crea carpetas (reutiliza las que existan) |
| `consolidarCarpetas` | Mueve documentos de carpetas sueltas a la carpeta canónica del docente | **Sí: mueve archivos y vacía carpetas** |

Orden recomendado al instalar: `prepararAuditoria` → `inspeccionarDrive` →
`crearCarpetasDocentes` → `revisarCarpetas` para confirmar.

> `crearCarpetasDocentes` y `consolidarCarpetas` son idempotentes: se pueden
> ejecutar las veces que haga falta sin duplicar nada. Antes de
> `consolidarCarpetas`, lea siempre el informe de `revisarCarpetas`.

---

## 4.1 Comprobación previa

En el editor, seleccione la función **`prepararAuditoria`** y ejecútela una vez.

Autoriza los permisos y deja en el registro un informe como este:

```
Auditoría: Auditoría Docentes 2026-1
Docentes en la hoja: 50
Acta obligatoria: SI
Diploma obligatorio: NO
Carpeta principal de Drive: SOPORTES DOCENTES
Hoja Validaciones: lista con 31 columnas.
```

Si algo falta, el mensaje de error dice exactamente qué.

---

## 5. Publicar la web app

*Implementar → Nueva implementación → Aplicación web*

| Campo | Valor |
|---|---|
| Ejecutar como | **Yo** (la cuenta dueña de la hoja y de la carpeta de Drive) |
| Quién tiene acceso | **Cualquier usuario de la organización** |

> «Ejecutar como: Yo» es lo que permite que Talento Humano escriba en la hoja y
> en Drive sin tener que ser propietario de ninguna de las dos cosas.
>
> Si la cuenta no es de Google Workspace, la opción «de la organización» no
> aparece; en ese caso cambie `"access"` a `"ANYONE"` en `appsscript.json`
> **solo si acepta que cualquiera con el enlace y sesión de Google pueda entrar**.

Copie la URL `/exec` y entréguela a Talento Humano.

### Para publicar cambios posteriores

Un `clasp push` **no actualiza** lo que ve la gente. Hay que hacer además:

*Implementar → Gestionar implementaciones → (lápiz) → Versión: Nueva versión → Implementar*

Así la URL se mantiene igual.

---

## 6. Cómo queda organizado Drive

```
VERIFICACIÓN DOCUMENTAL - AUDITORIA SNIES 2026
└── SUBIR DOCUMENTACIÓN DOCENTE          ← ID_CARPETA_PRINCIPAL_DRIVE
    ├── DOC-EJ-001 - DOCENTE EJEMPLO UNO
    │   ├── 01_ACTA_GRADO.pdf
    │   └── 02_DIPLOMA_GRADO.pdf
    └── DOC-EJ-002 - DOCENTE EJEMPLO DOS
        └── 01_ACTA_GRADO.pdf
```

> **`ID_CARPETA_PRINCIPAL_DRIVE` es la carpeta que contiene directamente las
> carpetas de los docentes**, no la carpeta de más arriba. La aplicación mira
> un solo nivel hacia abajo: si el parámetro apunta un nivel de más, no
> encuentra ninguna carpeta y las crea otra vez en el sitio equivocado.

- La carpeta de un docente se crea una sola vez. Si ya existe se reutiliza,
  incluso si alguien la renombró conservando el número de documento al inicio.
- Los soportes se guardan **siempre** con los nombres `01_ACTA_GRADO.pdf` y
  `02_DIPLOMA_GRADO.pdf`. El nombre original del archivo que cargó la persona
  no se conserva.
- No se crean carpetas vacías: la carpeta aparece cuando el docente tiene al
  menos un soporte.

### Por qué nunca aparece `01_ACTA_GRADO (1).pdf`

Drive agrega ese sufijo cuando conviven dos archivos con el mismo nombre en la
misma carpeta. Al reemplazar un soporte, la aplicación crea primero el archivo
nuevo y solo después manda el anterior a la papelera, así que los dos nunca
coexisten con el mismo nombre. El orden importa: si se borrara primero, un
fallo a mitad de camino dejaría al docente sin soporte.

### Trazabilidad hoja ↔ Drive

De cada revisión se guardan seis columnas que enlazan la fila con Drive:

| Columna | Contenido |
|---|---|
| `ID_CARPETA_DOCENTE` / `URL_CARPETA_DOCENTE` | Carpeta individual del docente |
| `ID_ACTA` / `URL_ACTA` | Acta de grado vigente |
| `ID_DIPLOMA` / `URL_DIPLOMA` | Diploma vigente, si lo hay |

Los **ID** son estables: siguen sirviendo para localizar el archivo aunque
alguien lo mueva o renombre en Drive. Las **URL** son las que abre la ficha.

> Al navegador solo viajan las URL. Los ID se quedan en el servidor y en la
> hoja: la interfaz no los necesita para nada.

---

## 7. Qué se guarda y qué no

La hoja `Docentes` **no se modifica nunca**. Si el auditor marca *No coincide*
en «Máximo nivel de estudio» y escribe `Maestría`, en `Docentes` sigue diciendo
`Especialización Universitaria` y en `Validaciones` queda:

| VAL_NIVEL_ESTUDIO | CORR_NIVEL_ESTUDIO | ESTADO |
|---|---|---|
| `NO_COINCIDE` | `Maestría` | `REQUIERE_CORRECCION` |

Para obtener la lista de correcciones pendientes, filtre `Validaciones` por
`ESTADO = REQUIERE_CORRECCION` y lea las columnas `CORR_*` que no estén vacías.

---

## 8. Reglas de la hoja Validaciones

- `NUM_DOCUMENTO` es el identificador único: un docente ocupa **una sola fila**,
  siempre. Editar una revisión actualiza esa fila, nunca agrega otra.
- `FECHA_VALIDACION` se fija en la primera revisión y no vuelve a cambiar.
- `FECHA_MODIFICACION` se actualiza en cada guardado.
- Ambas se guardan como `dd/MM/aaaa HH:mm` usando siempre la zona
  `America/Bogota`, aunque la hoja de cálculo tenga otra zona configurada.
- `VAL_*` solo admite `COINCIDE` o `NO_COINCIDE`.
- `ESTADO` es `VALIDADO` si los diez criterios coinciden; si no,
  `REQUIERE_CORRECCION`. Un docente sin fila está `PENDIENTE`.

---

## 9. Si algo falla

| Mensaje | Causa habitual |
|---|---|
| `No se encontró la hoja "Docentes"` | El proyecto no está enlazado al libro correcto |
| `Falta el parámetro ID_CARPETA_PRINCIPAL_DRIVE` | La fila no existe en `Configuracion` o está mal escrita |
| `No fue posible abrir la carpeta principal de Drive` | El ID es incorrecto o la cuenta que ejecuta no tiene acceso |
| `A la hoja "Docentes" le faltan estas columnas: ...` | Se renombró o borró una columna de origen |
| `El sistema está atendiendo otra revisión` | Dos personas guardaron a la vez; reintentar basta |

Los errores del servidor quedan en *Ejecuciones* dentro del editor de Apps Script.
