# Compensa — diseño funcional del módulo Valoración v1

Fecha: 2026-08-19
Estado: propuesta funcional inicial

## 1. Objetivo de esta versión

Definir el comportamiento funcional mínimo del primer módulo comercial de Compensa: **Valoración de Puestos**.

Esta versión debe permitir que un especialista de compensaciones:

1. cree o seleccione una metodología configurada;
2. registre un puesto y su descriptivo;
3. valore manualmente cada factor/dimensión;
4. vea el resultado calculado de forma determinística;
5. adjunte evidencia y justificación;
6. guarde versiones de la valoración;
7. compare el puesto con otros puestos;
8. opcionalmente solicite una sugerencia de IA;
9. acepte, modifique o rechace esa sugerencia;
10. mantenga trazabilidad completa de lo ocurrido.

El MVP no necesita automatizar el proceso completo de compensaciones ni eliminar la intervención humana.

---

## 2. Usuarios objetivo

### 2.1 Especialista de Compensaciones

Usuario principal.

Necesita:

- crear valoraciones;
- revisar descriptivos;
- seleccionar niveles;
- justificar decisiones;
- comparar puestos;
- detectar inconsistencias;
- preparar casos para comité.

### 2.2 Responsable / Jefe de Compensaciones

Necesita:

- revisar valoraciones preparadas por otros;
- aprobar o devolver valoraciones;
- comparar puestos de un mismo nivel o familia;
- controlar consistencia metodológica;
- consultar historial.

### 2.3 Administrador de metodología

Puede ser el mismo especialista en organizaciones pequeñas.

Necesita:

- configurar factores;
- configurar niveles;
- definir reglas de puntuación;
- definir grados/rangos;
- versionar la metodología;
- activar/desactivar configuraciones.

### 2.4 Usuario de consulta

En fases posteriores podría acceder a resultados aprobados sin capacidad de modificación.

---

## 3. Principios funcionales

### 3.1 Humano como autoridad final

La IA propone; el evaluador decide.

### 3.2 Cálculo determinístico

Los puntos y el grado final solo pueden provenir del motor configurado.

### 3.3 Toda decisión debe ser explicable

Una selección puede tener:

- evidencia;
- justificación;
- comentario;
- autor;
- fecha;
- origen de la propuesta.

### 3.4 Nunca sobrescribir historia

Una valoración aprobada no se modifica en sitio. Un cambio genera nueva versión.

### 3.5 La metodología es configuración

La aplicación no debe asumir una única estructura de factores o escalas.

### 3.6 La falta de información es un resultado válido

El sistema debe poder indicar:

> Información insuficiente para sugerir un nivel.

No debe inventar respuestas.

---

## 4. Estados de una valoración

Propuesta inicial:

```text
DRAFT
  ↓
IN_REVIEW
  ↓
APPROVED
```

Estados adicionales:

```text
RETURNED
SUPERSEDED
CANCELLED
```

### DRAFT

Editable por el evaluador.

### IN_REVIEW

Enviado a revisión. Puede quedar bloqueado para cambios salvo comentarios, según permisos.

### RETURNED

El revisor devuelve la valoración con observaciones.

### APPROVED

Resultado oficial dentro de la organización.

### SUPERSEDED

Existía una valoración aprobada, pero una versión más nueva fue aprobada posteriormente.

### CANCELLED

Borrador descartado sin convertirse en valoración oficial.

---

## 5. Entidades funcionales principales

### Organization

Representa a la empresa cliente.

Campos conceptuales:

```text
id
name
slug
country
currency
status
created_at
```

### Job

Representa al puesto, no a la persona que lo ocupa.

```text
id
organization_id
code
name
business_unit
department
area
job_family
job_subfamily
reports_to_job_id
location
status
created_at
updated_at
```

### JobDescription

Permite versionar descriptivos independientemente de la valoración.

```text
id
job_id
version
source_type
raw_text
structured_content
status
created_at
created_by
```

`structured_content` puede contener posteriormente:

```text
mission
responsibilities
scope
decision_authority
people_management
budget_responsibility
internal_relationships
external_relationships
requirements
education
experience
```

### Methodology

```text
id
organization_id nullable
name
version
status
content_owner
created_at
```

Una metodología puede ser:

- global de Compensa;
- propia de una organización;
- clonada y adaptada.

### Factor

```text
id
methodology_id
code
name
description
order
weight optional
```

### Dimension

```text
id
factor_id
code
name
description
order
required
```

Puede haber factores sin dimensiones explícitas.

### Level

```text
id
dimension_id or factor_id
code
label
description
order
metadata
```

### ScoringRule

Representa la lógica determinística.

```text
id
methodology_id
rule_type
inputs
output
version
```

El diseño técnico decidirá si estas reglas se expresan como tablas, fórmulas restringidas o estructuras declarativas.

### Grade

```text
id
methodology_id
code
name
min_points
max_points
order
```

### Valuation

```text
id
job_id
methodology_id
methodology_version
job_description_id
version
status
total_points
grade_id
created_by
reviewed_by
approved_by
created_at
submitted_at
approved_at
```

### ValuationDecision

Una decisión por factor/dimensión.

```text
id
valuation_id
factor_id
dimension_id nullable
selected_level_id
calculated_points
justification
source
created_at
updated_at
```

`source` puede indicar:

```text
MANUAL
AI_ACCEPTED
AI_MODIFIED
IMPORT
```

### Evidence

```text
id
valuation_decision_id
job_description_id
source_section
source_start optional
source_end optional
quoted_text
created_by
```

### AISuggestion

Debe mantenerse separada de la decisión final.

```text
id
valuation_id
factor_id
dimension_id nullable
suggested_level_id nullable
confidence
reasoning_summary
status
model_provider
model_name
prompt_version
created_at
```

Estados:

```text
PENDING
ACCEPTED
MODIFIED
REJECTED
INSUFFICIENT_INFORMATION
```

### AIEvidence

```text
id
ai_suggestion_id
source_section
quoted_text
relevance
```

### ClarificationQuestion

```text
id
valuation_id
factor_id nullable
dimension_id nullable
question
reason
status
answer
answered_by
answered_at
```

Estados:

```text
OPEN
ANSWERED
DISMISSED
```

### AuditEvent

```text
id
organization_id
actor_id
entity_type
entity_id
action
before
after
created_at
```

---

## 6. Navegación v1

Propuesta de navegación principal:

```text
Compensa
├── Inicio
├── Puestos
├── Valoraciones
├── Comparar
├── Metodologías
└── Configuración
```

En MVP, `Inicio` puede ser muy simple.

### Inicio

Indicadores útiles:

- puestos registrados;
- valoraciones en borrador;
- en revisión;
- aprobadas;
- devueltas;
- valoraciones con información faltante.

### Puestos

Tabla/listado de puestos.

Columnas mínimas:

```text
Código
Puesto
Área
Familia
Valoración actual
Puntos
Grado
Estado
Actualizado
```

Acciones:

- crear puesto;
- importar descriptivo;
- abrir puesto;
- iniciar valoración;

### Valoraciones

Lista de procesos de valoración.

Filtros:

- estado;
- área;
- familia;
- grado;
- evaluador;
- fecha;
- metodología.

### Comparar

Permite seleccionar inicialmente 2–5 puestos.

### Metodologías

Configuración y versiones.

No necesita ser un editor extremadamente sofisticado en la primera iteración, pero sí debe demostrar que la estructura no está hardcodeada.

---

## 7. Flujo 1 — Crear un puesto

### Pantalla

`Puestos > Nuevo puesto`

Campos mínimos:

```text
Código
Nombre del puesto
Área / departamento
Familia
Reporta a
Ubicación
```

Después:

```text
[Guardar]
[Guardar y agregar descriptivo]
```

### Criterios

- nombre obligatorio;
- código opcional pero único cuando exista;
- un puesto pertenece a una organización;
- no se elimina físicamente si tiene valoraciones: se inactiva.

---

## 8. Flujo 2 — Agregar descriptivo

Tres entradas previstas:

### A. Texto libre

Pegar contenido.

### B. Formulario estructurado

Campos por secciones.

### C. Archivo

DOCX/PDF en una fase posterior del MVP o inmediatamente después del núcleo.

El sistema debe conservar el texto fuente y, si se usa IA para estructurarlo, conservar también la versión estructurada derivada.

### Acción de IA opcional

```text
[✨ Estructurar descriptivo]
```

La IA puede proponer:

- misión;
- responsabilidades;
- alcance;
- autonomía;
- personal a cargo;
- presupuesto;
- requisitos.

El usuario debe poder corregir el resultado.

---

## 9. Flujo 3 — Iniciar valoración

Desde un puesto:

```text
[Iniciar valoración]
```

Se solicita:

```text
Metodología
Versión
Descriptivo a utilizar
```

El sistema crea un `DRAFT`.

Regla importante:

> Una valoración siempre queda vinculada a una versión exacta de metodología y de descriptivo.

Así una futura edición no cambia retroactivamente una valoración existente.

---

## 10. Pantalla principal de valoración

Propuesta desktop:

```text
┌────────────────────────────────────────────────────────────┐
│ Jefe de Planeamiento                         DRAFT          │
│ Finanzas · Lima · Metodología X v1.0                       │
│                                                            │
│  Descriptivo | Valoración | Comparables | Historial       │
├────────────────────────────────────────────────────────────┤
│                                                            │
│ Factor 1                                      120 pts       │
│ ─────────────────────────────────────────────────────────  │
│ Dimensión A                                                │
│                                                            │
│ ○ Nivel 1                                                  │
│ ○ Nivel 2                                                  │
│ ● Nivel 3                                                  │
│ ○ Nivel 4                                                  │
│                                                            │
│ [✨ Sugerir con IA]                                        │
│                                                            │
│ Sugerencia IA: Nivel 3 · confianza 82%                    │
│ Evidencia: “...”                                           │
│ Razón: ...                                                 │
│                                                            │
│ [Aceptar] [Elegir otro nivel] [Rechazar]                  │
│                                                            │
│ Justificación del evaluador                                │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ...                                                    │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ Evidencias                                                 │
│ • Responsabilidades, párrafo 3                             │
│ [+ agregar evidencia]                                      │
└────────────────────────────────────────────────────────────┘
```

Panel lateral o encabezado persistente:

```text
Decisiones completadas: 7/9
Puntos actuales: 487
Grado provisional: G12
Alertas: 1
```

El grado se etiqueta **provisional** mientras la valoración no esté aprobada.

---

## 11. Comportamiento al seleccionar un nivel

Al elegir un nivel:

1. se guarda la selección;
2. el motor recalcula los puntos asociados;
3. recalcula dependencias si las reglas lo requieren;
4. recalcula total;
5. recalcula grado provisional;
6. ejecuta validaciones;
7. registra auditoría.

La UI nunca calcula la puntuación como fuente de verdad. Debe mostrar el resultado devuelto por el motor del dominio/backend.

---

## 12. Validaciones metodológicas

El motor debe soportar tres clases de validación.

### Hard error

Impide continuar o aprobar.

Ejemplo genérico:

> Esta combinación de niveles no está permitida por la metodología configurada.

### Warning

Permite continuar, pero exige revisión.

Ejemplo:

> La combinación seleccionada es poco frecuente frente a otras valoraciones internas.

### Information

Solo aporta contexto.

Ejemplo:

> Este puesto no tiene comparables aprobados todavía.

Las reglas concretas deben provenir de configuración y no estar incrustadas en la interfaz.

---

## 13. Flujo 4 — Sugerencia de IA

El evaluador puede ejecutar:

```text
[✨ Analizar valoración]
```

o por decisión:

```text
[✨ Sugerir nivel]
```

### Entrada mínima de la IA

- contenido del descriptivo;
- factor/dimensión actual;
- definiciones autorizadas/configuradas de niveles;
- instrucciones de no inventar;
- opcionalmente contexto organizacional permitido.

### Salida esperada estructurada

```json
{
  "status": "SUGGESTION",
  "suggested_level_code": "L3",
  "confidence": 0.82,
  "reasoning_summary": "...",
  "evidence": [
    {
      "section": "Responsabilidades",
      "text": "..."
    }
  ],
  "missing_information": [],
  "clarification_questions": []
}
```

O:

```json
{
  "status": "INSUFFICIENT_INFORMATION",
  "suggested_level_code": null,
  "confidence": 0.31,
  "reasoning_summary": "El descriptivo no define el grado de autonomía...",
  "evidence": [],
  "missing_information": ["autonomía de decisión"],
  "clarification_questions": [
    "¿Qué decisiones puede tomar el puesto sin aprobación del superior?"
  ]
}
```

La salida debe validarse contra schema antes de guardarse.

---

## 14. Aceptar, modificar o rechazar IA

### Aceptar

```text
AI suggested = L3
Final = L3
Source = AI_ACCEPTED
```

### Modificar

```text
AI suggested = L3
Final = L2
Source = AI_MODIFIED
```

Debe ser posible indicar una razón:

```text
La descripción exagera el alcance; el presupuesto requiere aprobación superior.
```

### Rechazar

La sugerencia permanece almacenada pero no se convierte en decisión.

Puede registrarse una razón de rechazo:

```text
EVIDENCE_NOT_RELEVANT
MISSING_CONTEXT
WRONG_INTERPRETATION
METHODOLOGY_ERROR
OTHER
```

Esto será útil para calibración.

---

## 15. Flujo 5 — Información insuficiente

Si faltan datos, la UI debe mostrar algo como:

```text
⚠ Información insuficiente

No queda claro qué decisiones puede tomar el puesto sin aprobación.

Preguntas sugeridas:
1. ¿Qué decisiones toma de forma autónoma?
2. ¿Cuál es el nivel jerárquico que aprueba excepciones?
3. ¿Existe un presupuesto bajo responsabilidad directa?
```

El evaluador puede:

```text
[Responder ahora]
[Marcar para consulta]
[Continuar sin IA]
```

Las respuestas deben guardarse y convertirse en contexto adicional trazable, no editar silenciosamente el descriptivo original.

---

## 16. Resultado de valoración

La pantalla resumen debe mostrar:

```text
Puesto
Metodología / versión
Descriptivo / versión
Estado

Puntuación total
Grado

Desglose por factor
Decisión por dimensión
Origen de cada decisión
Advertencias
Información faltante
```

Ejemplo conceptual:

```text
Factor                    Nivel       Puntos     Origen
Conocimiento              C3          180        Manual
Complejidad               P2           95        IA aceptada
Responsabilidad           A4          212        IA modificada
---------------------------------------------------------
Total                                  487
Grado                                  G12
```

Los nombres anteriores son ilustrativos; no representan contenido metodológico que deba distribuirse.

---

## 17. Flujo 6 — Enviar a revisión

Acción:

```text
[Enviar a revisión]
```

Antes de permitirlo:

- todas las decisiones obligatorias completas;
- sin errores metodológicos hard;
- metodología activa;
- descriptivo asociado;
- puntuación calculada correctamente.

Warnings pueden mantenerse abiertos.

Al enviar:

```text
DRAFT → IN_REVIEW
```

Se registra evento de auditoría.

---

## 18. Flujo 7 — Revisar

El revisor ve:

- descriptivo;
- decisiones;
- evidencias;
- sugerencias IA;
- diferencias IA/humano;
- puntos;
- comparables;
- warnings;
- comentarios del evaluador.

Acciones:

```text
[Aprobar]
[Devolver con observaciones]
```

En v1 no es necesario construir un sistema complejo de firmas.

---

## 19. Historial y versiones

Una valoración debe mostrar:

```text
v1 — aprobada — 487 pts — G12 — 2026-08-19
v2 — borrador  — 503 pts — G13 — 2026-09-10
```

Comparar versiones debe permitir ver:

```text
Factor X: L2 → L3
Puntos: 487 → 503
Grado: G12 → G13
Descriptivo: v3 → v4
```

Al aprobar v2:

```text
v1 → SUPERSEDED
v2 → APPROVED
```

Nunca se borra la historia previa.

---

## 20. Comparables v1

Primera versión sin IA sofisticada:

Filtros por:

- familia;
- área;
- nivel;
- grado;
- rango de puntos.

El usuario selecciona puestos y ve una matriz:

```text
                         Puesto A   Puesto B   Puesto C
Factor 1                    L3         L3         L4
Factor 2                    L2         L3         L3
Factor 3                    L4         L4         L4
Total                       487        502        535
Grado                       G12        G12        G13
```

Esto ya aporta valor antes de implementar embeddings.

### Comparables v2

Luego agregar:

- similitud semántica;
- sugerencias automáticas;
- explicación de diferencias;
- alertas de inconsistencia.

---

## 21. Gold Standard y calibración

El sistema debe distinguir una valoración normal de una marcada como referencia experta.

Campo conceptual:

```text
is_gold_standard = true
```

Una suite de calibración podrá ejecutar la IA sobre estos casos sin cambiar la valoración oficial y comparar:

```text
AI suggestion vs expert decision
```

Métricas:

### Exact match

```text
% de decisiones donde IA = experto
```

### Adjacent match

```text
% donde IA queda a ±1 nivel
```

### Mean absolute level error

Distancia promedio entre nivel sugerido y nivel experto cuando el orden sea comparable.

### Acceptance rate

En uso real:

```text
ACCEPTED / total suggestions
```

### Modification rate

```text
MODIFIED / total suggestions
```

### Rejection rate

```text
REJECTED / total suggestions
```

### Coverage

```text
casos donde IA pudo sugerir / total
```

Un modelo que se abstiene correctamente puede ser preferible a uno que siempre responde.

---

## 22. Configuración de metodología v1

La interfaz administrativa mínima debe permitir:

### Datos generales

```text
Nombre
Versión
Estado
Notas
```

### Factores

```text
Código
Nombre
Descripción propia/autorizada
Orden
```

### Dimensiones

```text
Código
Nombre
Descripción
Obligatoria sí/no
```

### Niveles

```text
Código
Etiqueta
Descripción propia/autorizada
Orden
```

### Puntuación

Para MVP se recomienda comenzar con **tablas declarativas** en vez de un lenguaje de fórmulas arbitrarias.

Ejemplo conceptual:

```text
input combination → points
```

Esto facilita:

- validación;
- auditoría;
- testing;
- seguridad;
- importación/exportación.

Si la metodología exige fórmulas, se puede añadir posteriormente un DSL restringido.

### Grados

```text
G1  0–100
G2  101–150
...
```

Los valores reales serán configurados por el usuario autorizado.

---

## 23. Versionado de metodología

Una metodología publicada debe ser inmutable.

Flujo:

```text
Metodología v1.0 ACTIVE
        ↓ clonar
Metodología v1.1 DRAFT
        ↓ publicar
Metodología v1.0 RETIRED
Metodología v1.1 ACTIVE
```

Una valoración antigua conserva referencia a v1.0.

Nunca se recalculan automáticamente valoraciones históricas con una nueva configuración.

Puede existir una función explícita futura:

```text
Simular valoración bajo metodología v1.1
```

sin modificar el original.

---

## 24. Roles y permisos v1

Propuesta mínima:

### ADMIN

- organización;
- usuarios;
- metodologías;
- todos los puestos y valoraciones.

### COMP_SPECIALIST

- crear/editar puestos;
- crear valoraciones;
- usar IA;
- enviar a revisión.

### COMP_REVIEWER

- todo lo anterior;
- aprobar/devolver.

### VIEWER

- solo lectura de resultados autorizados.

Para un piloto de una sola persona pueden convivir todos los roles en un usuario, pero el modelo debe nacer preparado para separación.

---

## 25. Auditoría mínima

Registrar como eventos:

```text
JOB_CREATED
JOB_UPDATED
JOB_DESCRIPTION_CREATED
VALUATION_CREATED
DECISION_CHANGED
AI_ANALYSIS_REQUESTED
AI_SUGGESTION_CREATED
AI_SUGGESTION_ACCEPTED
AI_SUGGESTION_MODIFIED
AI_SUGGESTION_REJECTED
VALUATION_SUBMITTED
VALUATION_RETURNED
VALUATION_APPROVED
METHODOLOGY_CREATED
METHODOLOGY_PUBLISHED
```

No almacenar secretos ni prompts sensibles completos en el audit log general.

---

## 26. UX para evitar automatización engañosa

Evitar frases como:

> Valoración correcta: Nivel 4

Preferir:

> Sugerencia: Nivel 4

Mostrar siempre:

- confianza;
- evidencia;
- información faltante;
- decisión final humana.

No usar únicamente color para indicar confianza o discrepancia.

---

## 27. Reglas iniciales para confianza IA

La confianza no debe presentarse como una probabilidad matemática exacta de estar correcto salvo que exista calibración real.

Para la primera versión puede representarse como:

```text
Alta
Media
Baja
```

Aunque internamente el modelo devuelva un score numérico.

Propuesta de UI:

```text
Alta    → evidencia directa y suficiente
Media   → evidencia parcial / interpretación necesaria
Baja    → información incompleta o ambigua
```

Una confianza baja debe incentivar preguntas, no una selección automática.

---

## 28. Qué NO entra en Valoración v1

Para proteger el alcance:

- payroll;
- cálculo de remuneraciones;
- benchmarking salarial externo;
- merit review;
- presupuesto salarial;
- performance management;
- organigramas complejos;
- workflow corporativo configurable;
- entrenamiento/fine-tuning de modelos propios;
- múltiples metodologías comerciales listas de fábrica;
- interpretación autónoma sin revisión humana;
- importaciones masivas complejas;
- facturación SaaS.

---

## 29. Criterios de aceptación funcional del núcleo

El Stage 1 podrá considerarse funcionalmente cerrado cuando se pueda demostrar lo siguiente:

### Metodología

- crear una metodología en borrador;
- crear factores/dimensiones/niveles;
- definir puntos mediante configuración soportada;
- definir grados;
- publicar una versión;
- impedir edición destructiva de una versión publicada.

### Puesto

- crear un puesto;
- asociarle un descriptivo versionado.

### Valoración

- iniciar una valoración contra metodología + descriptivo específicos;
- completar todas las decisiones manualmente;
- calcular puntos sin IA;
- calcular grado sin IA;
- guardar justificaciones/evidencias;
- recargar la página sin perder decisiones;
- enviar a revisión;
- devolver;
- corregir;
- aprobar;
- crear nueva versión sin destruir la anterior.

### Auditoría

- identificar quién cambió una decisión y cuándo;
- identificar qué metodología y descriptivo produjeron el resultado.

### Tests

- mismo input produce mismo output;
- configuraciones inválidas son rechazadas;
- límites de grados se comportan correctamente;
- valoraciones históricas no cambian al crear una nueva versión de metodología.

La IA **no es requisito para declarar terminado el núcleo determinístico**.

---

## 30. Criterios de aceptación del asistente IA

Una vez implementado:

- puede analizar un descriptivo;
- devuelve JSON validado;
- cada sugerencia referencia evidencia o declara información insuficiente;
- puede abstenerse;
- el usuario puede aceptar/modificar/rechazar;
- se preservan sugerencia y decisión final;
- el cálculo final sigue siendo exclusivamente determinístico;
- cambiar de proveedor/modelo no requiere cambiar el motor de valoración;
- existe una suite de regresión sobre el gold standard.

---

## 31. Primer experimento con datos reales

Antes de buscar exactitud absoluta, ejecutar un piloto con aproximadamente 15–30 puestos ya conocidos por el experto.

Proceso:

```text
1. Anonimizar puesto.
2. Cargar descriptivo.
3. Registrar valoración experta como gold standard.
4. Ejecutar IA sin mostrarle la respuesta correcta.
5. Comparar cada factor/dimensión.
6. Registrar discrepancias.
7. Clasificar la causa.
```

Causas sugeridas:

```text
BAD_JOB_DESCRIPTION
MISSING_INFORMATION
AI_MISINTERPRETATION
AMBIGUOUS_LEVEL_DEFINITION
CONFIGURATION_ERROR
EXPERT_JUDGMENT
OTHER
```

Este análisis permitirá saber si mejorar:

- el prompt;
- la estructura del descriptivo;
- las explicaciones de niveles;
- las preguntas de aclaración;
- la UX;
- o la metodología configurada.

---

## 32. Próximo paso técnico

Con este diseño funcional cerrado en su primera versión, el siguiente trabajo es diseñar e implementar **Stage 1 — núcleo determinístico**.

Orden sugerido:

```text
1. Elegir stack técnico y estructura del repo.
2. Crear modelo de dominio.
3. Diseñar esquema de base de datos.
4. Definir formato declarativo de metodología.
5. Implementar motor puro de scoring.
6. Crear suite de tests del motor.
7. Construir API mínima.
8. Construir UI de metodología.
9. Construir UI de puestos.
10. Construir UI de valoración manual.
11. Añadir workflow y auditoría.
```

La primera implementación debe poder demostrar una valoración completa **sin usar ninguna IA**.

---

## 33. Decisiones funcionales pendientes

Estas decisiones no bloquean el documento, pero deberán resolverse durante la arquitectura técnica:

1. Stack web y backend.
2. Base de datos.
3. Estrategia de multi-tenancy inicial.
4. Autenticación para piloto.
5. Forma exacta de expresar tablas/reglas de puntuación.
6. Si el configurador de metodología v1 se hace por UI completa o mediante seed/import + UI limitada.
7. Formatos de importación de descriptivos en el MVP.
8. Proveedor de IA inicial.
9. Política de retención de contenido enviado a IA.
10. Hosting del piloto.

---

## 34. Decisión recomendada para continuar

No implementar aún el asistente IA.

El siguiente commit de producto debería crear el esqueleto de la aplicación y el dominio del motor de valoración, acompañado de tests que demuestren:

```text
configuración válida
→ selección de niveles
→ cálculo reproducible
→ total
→ grado
→ validaciones
```

Solo cuando ese núcleo sea estable conviene conectar un LLM.
