# Comparación manual 2–5

`/comparables/compare` completa el flujo de comparación deliberada previsto para Valoración v1. Su propósito es que un especialista o comité seleccione entre dos y cinco valoraciones aprobadas y revise sus resultados y decisiones lado a lado.

## Fuente y límites

La fuente son exclusivamente valoraciones operativas `APPROVED` de la organización activa.

Todas las seleccionadas deben usar exactamente el mismo `methodology_version_id`. Compensa no intenta traducir ni normalizar niveles entre metodologías o versiones distintas.

La funcionalidad no consulta Gold Standard, CALIBRATION ni HOLDOUT. El workspace no puede utilizarse como vía lateral para revelar referencias expertas reservadas.

## Selección

La UI agrupa las valoraciones aprobadas por versión metodológica y cada bloque genera su propia comparación.

El backend vuelve a validar:

- entre 2 y 5 IDs únicos;
- que todos existan como `APPROVED` dentro del tenant activo;
- que todos tengan puntos y grado finales;
- que todos usen la misma versión metodológica.

IDs duplicados se deduplican antes de validar el límite. Un ID de otro tenant, de una valoración no aprobada o inexistente se informa únicamente como valoración no disponible.

## Resultado

El workspace muestra:

- puestos y versiones seleccionadas;
- puntos por puesto;
- grado por puesto;
- mínimo y máximo de puntos observados;
- spread de puntos observado;
- grados presentes;
- familia, departamento y área como contexto;
- enlace a cada valoración fuente;
- matriz completa de factores/dimensiones y nivel elegido en cada valoración.

Cada dimensión queda en uno de tres estados descriptivos:

- `SAME_LEVEL`: todas las valoraciones tienen exactamente el mismo nivel;
- `ALL_MISSING`: ninguna tiene una decisión para esa dimensión;
- `DIFFERENT`: existe al menos una diferencia o una combinación de nivel presente/ausente.

La ausencia compartida no se presenta como equivalencia metodológica.

## Interpretación

El spread, la diferencia de grado o una diferencia por dimensión son hechos observables, no veredictos.

Compensa no afirma automáticamente que:

- una diferencia sea un error;
- dos puestos deban ser equivalentes;
- un caso sea un outlier;
- el grado deba cambiar;
- exista un umbral PASS/FAIL.

El especialista conserva la interpretación y la decisión.

## Relación con `/comparables`

Las dos pantallas resuelven problemas distintos:

- `/comparables`: toma una base y ordena precedentes compatibles por diferencias transparentes;
- `/comparables/compare`: el usuario elige deliberadamente 2–5 casos y los revisa en paralelo.

Ninguna de las dos utiliza IA ni similitud semántica en esta etapa.
