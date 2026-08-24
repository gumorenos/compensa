# Compensa — corridas de calibración

## Objetivo

Una referencia Gold Standard describe la decisión experta. Para medir acuerdo hace falta además una valoración candidata. Una corrida de calibración congela un conjunto de referencias y guarda las selecciones candidatas para poder reproducir la comparación después.

Compensa no calcula un `accuracy score` único ni aplica umbrales de aprobación arbitrarios. Expone las métricas observadas y conserva el detalle por caso para que los criterios de aceptación se definan con datos reales.

## Particiones

### CALIBRATION

Se usa durante ajuste y aprendizaje. Cada caso comienza ciego: antes de guardar el candidato no se muestran los niveles expertos. Después de guardar, el usuario puede ver el feedback de ese caso y las métricas agregadas parciales.

### HOLDOUT

Se usa como evaluación final. Mientras la corrida está `DRAFT`, Compensa oculta decisiones expertas, puntos, grado y métricas incluso después de guardar un candidato. Solo muestra progreso. El feedback se revela cuando todos los casos tienen candidato y la corrida se completa.

Esto no impide que un ADMIN conozca las referencias por otras rutas del producto; es una protección de workflow para evitar el uso accidental del holdout durante el ajuste.

## Snapshot e inmutabilidad

Al crear una corrida Compensa:

1. selecciona referencias `VALIDATED` de una sola metodología y una sola partición;
2. bloquea la selección durante la transacción;
3. verifica que cada referencia reproduzca exactamente sus puntos y grado;
4. copia a `calibration_run_cases` el puesto anonimizado, descriptivo, metodología, selecciones expertas y resultado experto;
5. conserva esa membresía aunque luego cambie la partición del caso original.

Una corrida `COMPLETED` y sus resultados son inmutables a nivel de PostgreSQL.

## Candidato

La primera versión solo permite `MANUAL`. El esquema reserva `EXTERNAL` y `AI`, pero `CalibrationService` rechaza esas fuentes hasta que exista una integración explícita. Esto evita presentar como funcional una capacidad de IA que todavía no existe.

El candidato usa exactamente el mismo `MethodologyDefinition` y `evaluateValuation` del núcleo determinístico. No hay un motor de scoring alternativo para calibración.

## Métricas

Por caso se conserva el resultado de `compareAgainstGoldStandard`:

- nivel experto y candidato por dimensión;
- distancia ordinal de nivel cuando ambas selecciones pertenecen a la misma dimensión;
- coincidencia exacta;
- coincidencia dentro de ±1 nivel;
- puntos experto y candidato;
- delta firmado y diferencia absoluta de puntos;
- diferencia porcentual cuando el valor experto no es cero;
- grado experto y candidato;
- coincidencia exacta de grado.

La agregación calcula:

- acuerdo exacto por dimensión, ponderado por número de dimensiones;
- acuerdo ±1 nivel;
- acuerdo exacto de grado;
- diferencia absoluta media de puntos (MAE);
- diferencia porcentual absoluta media cuando aplica;
- delta medio firmado de puntos, útil para observar sesgo hacia arriba o abajo;
- distancia absoluta media de nivel ponderada por dimensiones comparables;
- distancia máxima observada;
- mayor diferencia absoluta de puntos.

No existe todavía una etiqueta automática de `outlier`. La UI ordena las mayores desviaciones —primero discrepancias de grado y luego diferencia de puntos— sin decidir por sí sola cuáles deben excluirse.

## Permisos

Todos los roles con `VIEW` pueden consultar corridas. Crear, modificar candidatos y completar corridas requiere `MANAGE_CALIBRATION`, actualmente exclusivo de `ADMIN`.

## Estados

`DRAFT -> COMPLETED`

No hay reapertura de una corrida completada. Si cambia el candidato, metodología, conjunto o criterio, debe crearse una corrida nueva.

## Futuro

Cuando se añada IA, deberá crear una corrida nueva o alimentar una corrida explícitamente etiquetada con el modelo/proveedor/versión y parámetros relevantes. El resultado de IA se almacenará como candidato; la referencia experta permanecerá separada e inmutable.
