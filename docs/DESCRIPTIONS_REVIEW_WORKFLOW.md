# Compensa — descriptivos, evidencia y revisión

Fecha: 2026-08-21

## Objetivo

Hacer que una valoración sea defendible y reproducible, no solo un puntaje. Cada valoración debe conservar el descriptivo que se evaluó, la justificación experta de cada dimensión y las evidencias utilizadas para sostener el nivel elegido.

## Reglas implementadas

### Descriptivos versionados

- Cada guardado crea una nueva versión inmutable.
- La numeración por puesto es secuencial y protegida frente a concurrencia.
- Al iniciar una valoración se fija la última versión disponible del descriptivo.
- Crear un descriptivo posterior no modifica valoraciones ya iniciadas o aprobadas.
- Es posible iniciar una valoración sin descriptivo; en ese caso la evidencia puede provenir de entrevista/comité u otra fuente.

### Justificación y evidencia

- La decisión de nivel continúa siendo el único input que entra al motor de puntuación.
- La justificación explica por qué se seleccionó el nivel.
- La evidencia puede ser de tipo `JOB_DESCRIPTION`, `INTERVIEW` u `OTHER`.
- Si la evidencia se declara como `JOB_DESCRIPTION`, el extracto debe existir en el descriptivo fijado a la valoración.
- Cambiar un nivel no borra la justificación ya registrada.
- La evidencia es opcional para enviar a revisión en este incremento; la justificación es obligatoria para todas las dimensiones requeridas.

### Workflow

```text
DRAFT
  ↓ submit
IN_REVIEW
  ├─ approve → APPROVED
  └─ return  → RETURNED
                  ↓ edit + resubmit
              IN_REVIEW
```

- `DRAFT` y `RETURNED` son editables.
- `IN_REVIEW` y `APPROVED` no permiten editar niveles, fundamentos ni evidencias.
- Enviar a revisión exige cálculo completo y justificación en cada dimensión obligatoria.
- Devolver exige un comentario.
- Aprobar vuelve inmutable esa versión de valoración.
- Cada transición se registra en `valuation_review_actions` y en el audit log general.

## Persistencia

La migración `0002_descriptions_evidence_review.sql` agrega:

- `job_description_versions`
- `valuations.job_description_version_id`
- `valuation_decision_evidence`
- `valuation_review_actions`

Las relaciones incorporan `organization_id` en las claves foráneas relevantes para mantener aislamiento entre tenants también a nivel de PostgreSQL.

## Deliberadamente fuera de alcance

- autenticación y usuarios;
- RBAC entre evaluador y revisor;
- identidad real del actor en el historial;
- IA para extraer evidencia o sugerir niveles;
- carga de archivos DOCX/PDF;
- editor estructurado de descriptivos;
- E2E automatizado de navegador.

Esas capacidades se construirán sobre este modelo, no reemplazándolo.
