# Compensa — importación masiva de candidatos de calibración

## Objetivo

Las corridas de calibración pueden contener decenas de casos. Esta función permite cargar selecciones candidatas mediante `.xlsx` o `.csv` sin editar cada caso manualmente en la interfaz.

La importación no crea un motor de scoring alternativo. Cada candidato se valida y puntúa con la metodología congelada dentro de la corrida y se compara con la referencia experta mediante el mismo núcleo determinístico usado por Compensa.

## Plantilla por corrida

Desde una corrida `DRAFT`, un ADMIN puede descargar una plantilla Excel o CSV. La plantilla se genera desde el snapshot de esa corrida y contiene:

- `codigo_caso`
- `etiqueta_anonima`
- `codigo_dimension`
- `dimension`
- `codigo_nivel`
- `niveles_permitidos`

Solo debe completarse o modificarse `codigo_nivel`. Los demás campos sirven como contexto y para reducir errores de identificación.

La plantilla **no incluye el nivel experto, puntos expertos, grado experto ni métricas de comparación**. Esto aplica tanto a `CALIBRATION` como a `HOLDOUT`.

Si ya existe un candidato guardado para un caso, la plantilla muestra ese candidato en `codigo_nivel`. Esto permite corregirlo mientras la corrida siga `DRAFT` sin revelar la referencia experta.

## Lotes parciales

No es obligatorio cargar todos los casos de la corrida en un mismo archivo. En esta primera versión, para cargar solo un subconjunto debes eliminar del archivo las filas de los casos que no quieras incluir.

Cada caso que permanezca en el archivo debe contener todas las selecciones requeridas por la metodología. Un caso incompleto no produce puntuación provisional: el dry-run lo rechaza.

## Preview y escritura

El flujo es:

1. Descargar la plantilla de la corrida.
2. Completar `codigo_nivel` con uno de los códigos mostrados en `niveles_permitidos`.
3. Subir el archivo.
4. Ejecutar el dry-run.
5. Corregir todos los errores.
6. Guardar el lote validado.

Cambiar el archivo después del preview invalida visualmente la posibilidad de importar. Además, el servidor vuelve a ejecutar la validación inmediatamente antes de escribir; el navegador nunca es una fuente de confianza.

El lote es atómico. Primero se validan todos los casos incluidos y solo después se escribe. Si un caso posterior es inválido, ningún candidato del archivo queda guardado.

## Reemplazos

Si un caso ya tiene candidato y el archivo contiene nuevamente ese `codigo_caso`, el preview lo marca como `OVERWRITE`. El nuevo candidato reemplaza al anterior únicamente si la corrida todavía está `DRAFT`.

Una corrida `COMPLETED` no admite preview ni nuevas escrituras.

## CALIBRATION y HOLDOUT

### CALIBRATION

El preview puede mostrar el puntaje y grado del candidato y las métricas de comparación. Una vez guardado el lote, el feedback de los casos cargados queda disponible en la corrida.

### HOLDOUT

Mientras la corrida esté `DRAFT`, el preview deliberadamente devuelve `null` para:

- puntos del candidato;
- grado del candidato;
- métricas de comparación.

La interfaz tampoco renderiza esas columnas. Después de importar, el resumen de la corrida continúa oculto. El resultado se revela únicamente al completar explícitamente toda la corrida.

El servidor sí necesita calcular internamente el candidato para validar que sea reproducible; ese resultado no se devuelve en el read-model de preview HOLDOUT.

## Seguridad y aislamiento

- La página, Server Action y endpoint de plantilla requieren `MANAGE_CALIBRATION`, actualmente exclusivo de `ADMIN`.
- El `runId` siempre se resuelve dentro de la organización activa.
- Un `codigo_caso` que no pertenece a la corrida se reporta como inválido sin revelar su etiqueta ni comprobar públicamente si existe en otro tenant.
- Dimensiones desconocidas y niveles inválidos se rechazan contra el snapshot metodológico de cada caso.
- `.xlsx` y `.csv` heredan los límites de importación: 5 MiB, 5.000 filas, 64 columnas y celdas de hasta 100.000 caracteres.
- Las fórmulas XLSX se rechazan. Solo se procesan valores.
- El archivo original se procesa en memoria y no se persiste.

## Auditoría

Una importación exitosa registra `CALIBRATION_CANDIDATE_BATCH_IMPORTED` en `security_audit_events` con actor, corrida, nombre del archivo, cantidad de casos, reemplazos, partición y códigos de caso.

La auditoría forma parte de la misma transacción que las escrituras del lote. Si no puede registrarse, la importación completa se revierte.

## Cierre de la corrida

Importar candidatos no completa automáticamente la corrida. El cierre sigue siendo una acción explícita. Esto es especialmente importante en `HOLDOUT`, porque `COMPLETED` es la frontera que revela resultados y congela definitivamente la evaluación.
