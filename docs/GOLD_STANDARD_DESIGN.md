# Compensa — Gold Standard de valoración

Actualizado: 2026-08-21

## Objetivo

El Gold Standard es el conjunto de casos de referencia contra el que Compensa podrá medir cualquier asistente de IA, importador o heurística futura. No es una colección de notas finales: conserva suficiente contexto para reproducir una valoración experta y explicar en qué dimensiones una propuesta coincide o se desvía.

La regla central es:

> La referencia experta se congela; el candidato se recalcula con el motor determinístico y luego se compara.

La IA nunca define puntos directamente.

## Qué contiene un caso

Cada caso conserva de forma inmutable:

- organización propietaria;
- origen (`APPROVED_VALUATION` o, más adelante, `IMPORT`);
- código interno y etiqueta anonimizada;
- metodología y versión usadas;
- snapshot completo de la definición de metodología;
- snapshot de metadatos del puesto;
- snapshot del descriptivo usado por la valoración, si existe;
- decisión experta por dimensión;
- justificación experta por dimensión;
- evidencia de soporte disponible;
- puntos totales esperados;
- grado esperado;
- usuario experto/creador cuando exista;
- indicador de puesto ancla;
- partición del dataset;
- fecha de validación y notas.

Los snapshots son deliberados: una metodología o descriptivo pueden seguir existiendo como entidades versionadas, pero el caso de calibración debe poder auditarse sin depender de que el resto del producto cambie.

## Particiones

Un caso tiene una de tres particiones:

- `UNASSIGNED`: todavía no se decidió su uso.
- `CALIBRATION`: puede usarse para diseñar prompts, reglas o ajustar comportamiento.
- `HOLDOUT`: reservado para medir desempeño después de los ajustes.

No se debe optimizar un asistente observando los resultados de `HOLDOUT`. De lo contrario, la métrica deja de representar generalización.

Con un primer dataset de 15–30 casos, la asignación puede empezar pequeña y estratificada. La proporción exacta se decidirá cuando exista el inventario real; no se fija todavía un umbral arbitrario.

## Puestos ancla

`is_anchor=true` identifica puestos de referencia especialmente confiables o útiles para comparar consistencia vertical/horizontal. Ser ancla no cambia el puntaje ni da peso automático adicional a las métricas en v1.

## Captura desde una valoración aprobada

El primer flujo implementado parte de una valoración `APPROVED` ya existente en Compensa.

Antes de crear el caso, el servicio debe:

1. bloquear la valoración durante la captura;
2. comprobar que pertenece a la organización solicitada;
3. exigir estado `APPROVED`;
4. cargar metodología, puesto, descriptivo anclado, decisiones y evidencias;
5. recalcular las selecciones con el motor determinístico;
6. comprobar que puntos y grado recalculados coinciden con el resultado aprobado almacenado;
7. crear caso, decisiones y evidencias en una sola transacción.

Si cualquiera de esas condiciones falla, no se crea un Gold Standard parcial.

Una valoración aprobada solo puede originar un caso Gold Standard por organización. Si se necesita una referencia diferente, debe existir una nueva valoración experta/versionada en lugar de sobrescribir el caso histórico.

## Importación histórica

El esquema permite `source_type=IMPORT`, pero el importador no forma parte de este incremento. Cuando se implemente deberá validar exactamente las mismas invariantes:

- metodología conocida/versionada;
- dimensiones y niveles válidos;
- score determinístico reproducible;
- puntos/grado esperados coherentes;
- texto anonimizado antes de persistir cuando corresponda.

No se importarán evaluaciones como “verdad” solo porque vienen de una hoja Excel: deben pasar validación explícita.

## Métricas v1

Para un candidato con selecciones por dimensión, Compensa calcula primero sus puntos/grado con el motor normal y luego reporta:

- `dimensionExactAgreementRate`: proporción de dimensiones con nivel exactamente igual;
- `dimensionWithinOneLevelRate`: proporción a distancia máxima de un nivel;
- `meanAbsoluteLevelDistance`: distancia media de nivel en el orden declarado por la metodología;
- `maxLevelDistance`: mayor desviación observada;
- `pointDelta`: puntos candidato menos puntos expertos;
- `absolutePointDifference`;
- `absolutePointDifferencePercent` cuando el score experto no es cero;
- `gradeMatch`;
- detalle dimensión por dimensión.

No se fijan todavía metas de aceptación. Los umbrales se definirán después de observar el Gold Standard real y la variabilidad entre evaluadores expertos.

## Privacidad

El Gold Standard describe puestos, no personas. Aun así, un descriptivo puede contener nombres, proyectos, montos, ubicaciones u otros datos identificables.

Antes de usar casos reales para calibrar servicios externos de IA:

- anonimizar nombres personales y datos no necesarios;
- evitar copiar datos de desempeño o compensación individual;
- minimizar contexto comercial sensible;
- definir política de retención y proveedor de IA antes de enviar texto fuera de Compensa.

La etiqueta `anonymized_label` no anonimiza mágicamente el contenido; la sanitización del texto es una responsabilidad separada.

## Fuera de alcance de esta fundación

- llamadas a modelos de IA;
- prompt tuning;
- evaluación automática de evidencia generada por IA;
- consenso entre múltiples expertos;
- adjudicación de desacuerdos;
- ponderación estadística por familia/nivel;
- UI masiva de importación Excel/CSV;
- umbrales de calidad comerciales.

Esos bloques se construyen encima de esta referencia estable.