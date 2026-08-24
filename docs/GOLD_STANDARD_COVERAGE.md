# Gold Standard — cobertura del dataset

`/gold-standard/coverage` es una vista descriptiva de las referencias expertas que existen hoy en una organización. Su objetivo es mostrar distribución y faltantes observables antes de usar el dataset para calibrar o evaluar propuestas automáticas.

## Principio

Compensa **no** asigna un `quality score`, `readiness score`, semáforo ni umbral automático de “dataset suficiente”. En esta etapa no existe evidencia empírica propia para justificar esos cortes.

La vista muestra hechos verificables para que un especialista decida qué reforzar.

## Qué cuenta como dataset activo

Las distribuciones de calibración se calculan únicamente con referencias `VALIDATED`.

Las referencias `DRAFT` y `ARCHIVED` se cuentan por separado y no entran en:

- CALIBRATION / HOLDOUT / UNASSIGNED;
- cobertura por grado;
- anclas;
- familias de puesto;
- evidencia, descriptivo y justificación;
- demás señales orientadas al uso del Gold Standard.

## Métricas globales

- referencias totales;
- `VALIDATED`;
- `DRAFT`;
- `ARCHIVED`;
- referencias en `CALIBRATION`;
- referencias en `HOLDOUT`;
- referencias `UNASSIGNED`;
- puestos ancla.

## Cobertura por metodología y versión

Cada `methodology_version_id` se analiza por separado. No se mezclan casos entre versiones aunque compartan código de metodología.

Por versión se muestra:

- total registrado y total validado;
- particiones;
- anclas;
- casos con descriptivo congelado;
- casos con alguna evidencia;
- casos que cubren todas las dimensiones obligatorias;
- casos con justificación en todas las dimensiones obligatorias;
- distribución por todos los grados definidos en el snapshot metodológico;
- distribución por familia de puesto;
- distribución por origen de referencia (`IMPORT` o `APPROVED_VALUATION`).

## Huecos observables

Los códigos actuales describen únicamente ceros o datos faltantes:

- `DRAFT_CASES`: referencias todavía no validadas;
- `UNASSIGNED_CASES`: referencias validadas sin partición;
- `NO_VALIDATED_CASES`: una metodología tiene referencias registradas pero ninguna validada;
- `NO_CALIBRATION_CASES`: ninguna referencia validada de la versión está en CALIBRATION;
- `NO_HOLDOUT_CASES`: ninguna está en HOLDOUT;
- `NO_ANCHOR_CASES`: no hay puestos ancla marcados;
- `UNCOVERED_GRADES`: uno o más grados definidos no tienen casos validados;
- `MISSING_JOB_FAMILY`: casos sin familia de puesto;
- `MISSING_DESCRIPTION`: casos sin descriptivo congelado;
- `INCOMPLETE_REQUIRED_DECISIONS`: falta al menos una dimensión obligatoria;
- `INCOMPLETE_JUSTIFICATIONS`: falta justificación en al menos una dimensión obligatoria;
- `NO_EVIDENCE`: el caso no tiene evidencia asociada a ninguna decisión.

Que aparezca uno de estos hechos **no significa automáticamente que el dataset sea inválido**. Por ejemplo, una metodología usada solo para ciertos niveles podría no necesitar representar todos sus grados en una prueba concreta. La decisión sigue siendo del especialista.

## Aislamiento y permisos

La vista usa permiso `VIEW`; es completamente read-only.

Todas las consultas se filtran por `organization_id`. Las decisiones y evidencias se agregan mediante las foreign keys tenant-aware existentes y nunca se consultan globalmente para formar un reporte.

No se añade ninguna tabla, migración ni superficie de escritura.

## Uso recomendado antes de IA

Antes de calibrar un modelo o asistente, revisar al menos:

1. si CALIBRATION y HOLDOUT contienen casos de la misma versión metodológica;
2. qué grados no están representados;
3. si el dataset se concentra excesivamente en una sola familia de puesto;
4. si existen puestos ancla;
5. si las referencias tienen suficiente descriptivo, justificación y evidencia para explicar por qué un experto escogió cada nivel.

El dashboard ayuda a detectar estas preguntas; no responde automáticamente cuándo el dataset ya es “suficiente”.
