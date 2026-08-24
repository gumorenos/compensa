# Comparables internos

`/comparables` permite revisar consistencia interna entre valoraciones de puestos ya aprobadas.

## Alcance

La fuente son exclusivamente valoraciones normales con estado `APPROVED` de la organización activa.

Una valoración solo puede compararse contra otras que usen exactamente el mismo `methodology_version_id`. No se mezclan versiones metodológicas aunque compartan código o nombre.

Esta funcionalidad **no consulta Gold Standard, CALIBRATION ni HOLDOUT**. Esto es deliberado: el análisis de consistencia de valoraciones operativas no debe crear una ruta lateral para revelar el conjunto experto reservado o un holdout ciego.

## Qué se compara

Para cada candidato compatible se muestran hechos observables:

- puntos y diferencia de puntos respecto de la base;
- grado y distancia ordinal de grado según el orden definido en el snapshot metodológico;
- cantidad de dimensiones comparadas;
- cantidad de dimensiones con nivel exacto;
- suma de saltos de nivel en las dimensiones diferentes;
- detalle factor/dimensión de cada diferencia;
- coincidencia de familia de puesto;
- coincidencia de departamento;
- si se trata de otra versión aprobada del mismo puesto.

Familia y departamento se muestran como contexto. **No alteran silenciosamente el orden del ranking.**

## Orden de presentación

No existe un `similarity score` compuesto.

Los candidatos se ordenan lexicográficamente por:

1. menor `|Δ grado|`;
2. menor `|Δ puntos|`;
3. menor suma de saltos de nivel;
4. nombre del puesto y versión como desempate determinístico.

Un grado que no exista en la definición metodológica no recibe una distancia inventada: su distancia queda `null` y se coloca después de las distancias conocidas.

## Interpretación

El orden significa únicamente “más cercano según estas diferencias explícitas”. No significa:

- que dos puestos sean equivalentes;
- que deban tener el mismo grado;
- que una diferencia sea un error;
- que un caso sea automáticamente un outlier;
- que exista un umbral de consistencia aprobado por Compensa.

El especialista sigue siendo responsable de interpretar el contexto organizacional y la evidencia de cada puesto.

## Permisos y aislamiento

La vista usa `VIEW`, porque trabaja con valoraciones operativas aprobadas que ya forman parte de la información normal de la organización.

Todas las consultas se filtran por `organization_id`. La base solicitada debe ser una valoración `APPROVED` del tenant activo; un ID de otra organización, un draft o una valoración no disponible produce una base no encontrada.

Gold Standard continúa protegido de forma independiente con `MANAGE_GOLD_STANDARD`.

## No objetivos de este incremento

- IA o embeddings para similitud semántica;
- inferir comparables por título de puesto;
- score compuesto de similitud;
- detectar outliers automáticamente;
- comparar entre metodologías o versiones distintas;
- modificar valoraciones desde la pantalla de comparables;
- usar Gold Standard como fuente de comparación.

Una etapa posterior puede investigar comparabilidad semántica o reglas por familias, pero deberá mantener explicabilidad, aislamiento y validación con datos reales antes de introducir pesos o umbrales.
