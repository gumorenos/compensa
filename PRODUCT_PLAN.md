# Compensa — visión de producto y plan inicial

Fecha de inicio: 2026-08-19

## 1. Propósito

Compensa será una plataforma modular de compensaciones que permita a una organización adoptar solamente los componentes que necesite, empezando por un módulo de valoración de puestos y ampliándose posteriormente hacia descriptivos, arquitectura de puestos, bandas salariales, análisis de equidad y otros procesos de compensaciones.

El objetivo inicial no es reemplazar el juicio profesional del especialista de compensaciones. El producto debe convertir procesos que hoy suelen ejecutarse en hojas de cálculo, documentos y comités manuales en un flujo estructurado, auditable, reproducible y asistido por IA cuando aporte valor.

## 2. Principio central de diseño

La lógica crítica de valoración debe separarse de la IA.

- **IA:** interpreta texto, extrae evidencia, propone niveles, identifica información faltante, busca comparables y explica diferencias.
- **Motor determinístico:** aplica configuraciones, reglas de puntuación, validaciones, cálculos, rangos y grados.
- **Evaluador humano:** conserva la decisión final y puede aceptar, modificar o rechazar las sugerencias.

Consecuencia deseada:

> Misma configuración + mismas selecciones = mismo resultado.

La IA nunca debe modificar silenciosamente el resultado de una valoración.

## 3. Alcance del producto a largo plazo

La plataforma se plantea como una suite modular.

### Módulo 1 — Valoración de puestos

- Configuración de metodologías.
- Factores, dimensiones, niveles y reglas.
- Valoración manual.
- Asistencia de IA.
- Evidencia por decisión.
- Historial y auditoría.
- Comparación entre puestos.
- Consistencia interna.
- Comités de valoración.

### Módulo 2 — Descriptivos de puesto

- Creación y edición estructurada.
- Plantillas organizacionales.
- Importación de documentos existentes.
- Asistencia de IA para redacción y normalización.
- Control de versiones y aprobaciones.
- Vinculación directa con la valoración.

### Módulo 3 — Arquitectura de puestos

- Familias y subfamilias.
- Carrera profesional y de liderazgo.
- Niveles organizacionales.
- Job leveling.
- Relaciones entre puestos.
- Organigrama lógico de puestos.

### Módulo 4 — Bandas salariales

- Grados.
- Mínimo, midpoint y máximo.
- Spread y progresión.
- Compa-ratio.
- Posicionamiento salarial.
- Integración con resultados de valoración.

### Módulo 5 — Equidad y analítica de compensaciones

- Equidad interna.
- Compresión salarial.
- Outliers.
- Distribución por grado.
- Comparaciones por área, familia o nivel.
- Alertas y dashboards.

### Módulos futuros posibles

- Salary review / merit increase.
- Presupuesto salarial.
- Simulación de incrementos.
- Headcount cost.
- Total compensation.
- Benchmark de mercado.
- Pay equity avanzada.

Cada módulo debe ser comercializable por separado. Los planes comerciales pueden ofrecer bundles sin obligar a usar toda la suite.

## 4. Metodologías de valoración

### 4.1 Primera metodología

La primera implementación se construirá alrededor de la metodología de valoración que el experto de producto domina actualmente.

La aplicación **no debe incorporar material propietario de terceros sin autorización**. Las explicaciones, etiquetas, descripciones operativas y contenido de ayuda que se distribuyan con Compensa deberán ser originales, estar licenciados o ser configurados por el cliente.

### 4.2 Motor genérico

Aunque el primer caso de uso se base en una metodología concreta, el software no debe codificarla de forma rígida.

El modelo debe permitir definir de forma configurable:

```text
Metodología
  ├── Factores
  │     ├── Dimensiones / subfactores
  │     ├── Niveles
  │     ├── descripciones propias
  │     └── reglas / puntos
  ├── reglas de combinación
  ├── validaciones
  └── grados / rangos
```

Esto permitirá incorporar posteriormente otras metodologías sin reconstruir el núcleo.

### 4.3 Método propio simplificado

En una etapa posterior se evaluará crear un método point-factor propio de Compensa para organizaciones que no utilizan una metodología formal.

Posibles dimensiones a investigar y validar:

- conocimiento;
- complejidad;
- autonomía;
- impacto;
- responsabilidad;
- gestión de personas;
- alcance organizacional.

Este método debe desarrollarse como un framework independiente y no como una versión simplificada de una metodología propietaria existente.

## 5. Dataset de calibración — Gold Standard

Antes de delegar decisiones relevantes a IA se debe construir un conjunto de valoraciones de referencia realizadas o validadas por un experto.

Objetivo inicial: **15–30 puestos** de niveles y naturalezas diferentes.

Idealmente incluir:

- auxiliar / asistente;
- analista;
- especialista;
- supervisor;
- jefe;
- gerente;
- director, cuando existan casos;
- puestos administrativos;
- puestos operativos;
- puestos con y sin personas a cargo.

Para cada caso se busca conservar:

```text
Descripción del puesto
→ valoración final experta
→ decisiones por factor/dimensión
→ puntos
→ grado o nivel resultante
→ justificación cuando exista
```

Los datos deben poder anonimizarse.

Este dataset permitirá medir:

- coincidencia de la sugerencia automática con el experto;
- diferencia de puntos;
- frecuencia de correcciones;
- factores con mayor error;
- ambigüedad de los descriptivos;
- evolución de calidad de los prompts/modelos.

## 6. Flujo conceptual de valoración

```text
Descripción del puesto
        ↓
Extracción estructurada
        ↓
Sugerencias de IA + evidencia + confianza
        ↓
Evaluador humano confirma/corrige
        ↓
Motor determinístico aplica reglas
        ↓
Puntos / grado / perfil
        ↓
Comparación con puestos internos
        ↓
Revisión / aprobación
        ↓
Historial auditable
```

## 7. Evidencia y trazabilidad

Cada decisión relevante debe poder responder:

- ¿qué nivel fue sugerido?;
- ¿qué nivel fue elegido?;
- ¿qué texto sustenta la decisión?;
- ¿quién decidió?;
- ¿cuándo?;
- ¿qué versión de la metodología estaba activa?;
- ¿qué sugirió la IA?;
- ¿qué corrigió el especialista?;
- ¿qué modelo/prompt generó la sugerencia, cuando corresponda?;
- ¿qué cambió respecto de la versión anterior?

Ejemplo conceptual:

```text
Puesto: Gerente de Operaciones
Factor: X
Nivel sugerido por IA: 4
Nivel final: 3
Puntos calculados: 123
Evidencia: fragmento del descriptivo
Fuente: Responsabilidades / párrafo 4
Decisión final: evaluador humano
Fecha: 2026-08-19
```

La diferencia entre **valoración sugerida** y **valoración final** debe conservarse como dato de producto, no sobrescribirse.

## 8. Comparables internos

Una segunda capacidad de alto valor será comparar una valoración en curso con precedentes internos.

Ejemplo:

```text
Nueva valoración: Jefe de Planeamiento

Comparables internos
- Jefe de Planeamiento Financiero
- Jefe de Control de Gestión
- Jefe de Business Intelligence
```

El sistema debería poder señalar:

- puestos estructuralmente similares;
- diferencias de puntuación;
- factores responsables de la diferencia;
- potenciales inconsistencias;
- valoraciones que requieren revisión.

La similitud semántica nunca debe sustituir la valoración formal; funciona como herramienta de consistencia y apoyo al comité.

## 9. Estrategia de IA

### IA sí debe hacer

- leer descriptivos;
- extraer responsabilidades, alcance, autonomía e impacto;
- localizar evidencia relevante;
- proponer una clasificación por factor/dimensión;
- explicar la propuesta con lenguaje propio;
- asignar confianza a la recomendación;
- detectar información faltante o contradictoria;
- formular preguntas al evaluador;
- buscar puestos comparables;
- resumir diferencias entre valoraciones.

### IA no debe hacer

- inventar información ausente;
- cambiar reglas de puntuación;
- asignar puntos fuera del motor configurado;
- aprobar una valoración sin trazabilidad;
- ocultar que una decisión provino de una sugerencia automática;
- reemplazar silenciosamente una decisión humana.

## 10. MVP — módulo Valoración

El MVP debe demostrar una sola hipótesis principal:

> Compensa puede reproducir de forma consistente y explicable un proceso de valoración profesional, reduciendo trabajo manual sin eliminar el control del especialista.

### Entregables MVP

1. Modelo genérico de metodología.
2. Configuración de factores, dimensiones y niveles.
3. Motor determinístico de cálculo.
4. CRUD mínimo de organizaciones y puestos.
5. Descripción estructurada o texto libre del puesto.
6. Valoración manual completa.
7. Historial de versiones.
8. Evidencia por decisión.
9. Sugerencias de IA desacopladas del cálculo.
10. Aceptar/modificar/rechazar sugerencias.
11. Registro de sugerencia IA vs. decisión final.
12. Resultado de puntos/grado.
13. Comparación básica con otros puestos.
14. Dataset de calibración y reporte básico de concordancia.

## 11. Métricas iniciales

No basta con medir uso. Para el MVP interesan especialmente:

- porcentaje de decisiones IA aceptadas sin cambios;
- porcentaje aceptadas con modificación;
- porcentaje rechazadas;
- diferencia promedio de puntos frente al gold standard;
- coincidencia por factor;
- número de preguntas de aclaración necesarias;
- tiempo medio por valoración;
- número de revisiones por puesto;
- consistencia frente a puestos comparables.

## 12. Seguridad y privacidad

La información de puestos, organigramas y compensaciones puede ser sensible.

Principios iniciales:

- separación estricta por organización/tenant;
- mínimo privilegio;
- auditoría de cambios;
- cifrado en tránsito y reposo donde aplique;
- no usar datos de clientes para entrenar modelos sin consentimiento explícito;
- minimizar contenido enviado a proveedores de IA;
- permitir desactivar IA por organización;
- mantener el cálculo crítico disponible sin IA;
- evaluar proveedores de modelos según privacidad, retención y residencia de datos.

## 13. Riesgos a vigilar

### Propiedad intelectual

No distribuir texto, tablas, manuales ni material protegido de metodologías de terceros sin licencia. El contenido propio o del cliente debe estar claramente separado del motor técnico.

### Sobreconfianza en IA

Una respuesta con alta confianza aparente puede ser incorrecta. La interfaz debe presentar la recomendación como sugerencia y exigir evidencia.

### Descriptivos deficientes

Muchos puestos estarán mal documentados. El producto debe detectar insuficiencia de información en vez de completar vacíos por inferencia.

### Inconsistencia histórica

Las valoraciones existentes de una empresa pueden contener decisiones contradictorias. Los precedentes son referencias, no verdad absoluta.

### Configuración metodológica incorrecta

El motor puede calcular perfectamente una configuración mal cargada. Se necesitarán validaciones, versionado y pruebas de configuración.

## 14. Etapas de desarrollo

### Stage 0 — definición funcional

- visión de producto;
- flujo del evaluador;
- entidades principales;
- contrato IA vs. motor determinístico;
- pantallas v1;
- criterios de aceptación.

### Stage 1 — núcleo determinístico

- modelo de datos;
- metodología configurable;
- motor de cálculo;
- puestos;
- valoraciones manuales;
- historial;
- pruebas unitarias del motor.

### Stage 2 — evidencia y workflow

- fuentes/evidencias;
- estados de valoración;
- revisión/aprobación;
- auditoría;
- comparación entre versiones.

### Stage 3 — asistente IA

- análisis de descriptivo;
- extracción estructurada;
- sugerencias;
- evidencia;
- nivel de confianza;
- preguntas faltantes;
- aceptación/corrección/rechazo.

### Stage 4 — calibración

- carga de gold standard;
- ejecución automática contra referencias;
- métricas de concordancia;
- evaluación de prompts/modelos;
- regresión antes de cambiar el asistente.

### Stage 5 — comparables y consistencia

- embeddings o búsqueda híbrida;
- comparables internos;
- explicación de diferencias;
- alertas de inconsistencia.

### Stage 6 — piloto SaaS

- multi-tenant completo;
- onboarding;
- roles y permisos;
- configuración por cliente;
- observabilidad;
- backups;
- límites/planes;
- preparación comercial.

## 15. Decisiones ya tomadas

1. Compensa será modular.
2. Valoración será el primer módulo.
3. El motor de valoración será genérico y configurable.
4. La IA no será el motor de cálculo.
5. El resultado final seguirá bajo control humano.
6. Se guardará sugerencia IA y decisión final por separado.
7. La evidencia será parte central del modelo.
8. Se construirá un dataset gold standard para calibración.
9. Se evitará distribuir material propietario no autorizado.
10. Un método propio simplificado se investigará después del MVP, no antes.

## 16. Próximo hito

Cerrar el diseño funcional de **Valoración v1** y convertirlo en:

- modelo de datos;
- contratos de dominio;
- arquitectura técnica;
- backlog implementable;
- casos de prueba del motor.

Ver `docs/VALUATION_V1_FUNCTIONAL_DESIGN.md`.
