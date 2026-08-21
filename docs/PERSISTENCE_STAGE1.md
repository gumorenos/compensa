# Compensa — persistencia Stage 1

Fecha: 2026-08-20

## Objetivo

Persistir el núcleo determinístico de valoración sin acoplarlo todavía a UI ni IA. El sistema debe soportar varias organizaciones, versiones de metodología, borradores parciales, auditoría y concurrencia básica.

## Decisiones

### PostgreSQL estable

Se usa PostgreSQL 18.x. PostgreSQL 19 todavía se encuentra en beta al momento de este incremento.

### SQL explícito y `pg`

No se incorpora ORM en esta etapa. Las razones son:

- hacer visible el aislamiento por `organization_id`;
- mantener migraciones auditables;
- evitar una capa adicional mientras el modelo todavía está estabilizándose;
- conservar libertad para incorporar un query builder u ORM más adelante si aporta valor real.

### Metodología versionada como JSONB

La definición declarativa del motor se almacena completa en `methodology_versions.definition`.

Esto permite que una valoración apunte a una versión exacta de configuración. No se normalizan todavía factores/dimensiones/niveles en tablas independientes porque el núcleo ya consume esa estructura como documento inmutable y aún estamos validando el modelo.

### Multi-tenancy desde el repositorio

Las entidades del cliente llevan `organization_id`. Los métodos de lectura y escritura reciben explícitamente la organización y filtran por ella.

Este incremento prueba aislamiento en integración. Row Level Security de PostgreSQL queda como hardening posterior, no como sustituto del scoping de aplicación.

### Metodologías globales y de cliente

`methodology_versions.organization_id` puede ser nulo:

- `NULL`: configuración global ofrecida por Compensa;
- UUID: configuración perteneciente a una organización.

Una organización puede consumir su propia metodología o una global, pero no la configuración privada de otro tenant.

### Valoraciones parciales

Mientras falten dimensiones requeridas:

- se guardan las decisiones disponibles;
- `total_points` permanece `NULL`;
- `grade_code` permanece `NULL`;
- no se inventa un puntaje provisional incompleto.

Cuando la última dimensión requerida queda registrada, el servicio ejecuta el motor determinístico y persiste puntos y grado.

### Versionado concurrente

Cada nueva valoración obtiene una versión secuencial por puesto. La asignación se ejecuta dentro de transacción y toma un advisory lock derivado del `job_id`, evitando que dos creaciones simultáneas reciban la misma versión.

### Auditoría append-only

`valuation_events` registra por ahora:

- `VALUATION_CREATED`;
- `DECISION_SAVED`;
- `VALUATION_RECALCULATED`.

El historial no sustituye un sistema de auditoría completo, pero crea desde el inicio una línea de eventos que podrá ampliarse cuando entren review/approval y usuarios autenticados.

### Migraciones con checksum

`schema_migrations` guarda nombre y SHA-256. Ejecutar migraciones dos veces es idempotente; modificar una migración ya aplicada produce `MIGRATION_CHECKSUM_MISMATCH` en vez de cambiar silenciosamente una base existente.

## Esquema actual

```text
organizations
    ├── jobs
    │     └── valuations
    │            ├── valuation_decisions
    │            └── valuation_events
    └── methodology_versions
             └── valuations
```

## Tests de integración

CI levanta PostgreSQL real y verifica:

1. migraciones idempotentes;
2. flujo completo puesto → valoración → decisiones → 231 puntos/G3 con fixture ficticio;
3. borradores parciales sin puntaje;
4. aislamiento entre tenants;
5. creación concurrente de versiones 1 y 2;
6. metodologías globales compartibles;
7. rechazo de metodologías inválidas;
8. rollback de decisiones inválidas sin residuos de auditoría.

## Fuera de alcance de este incremento

- autenticación y usuarios;
- Row Level Security;
- estados review/approval operables desde UI;
- descriptivos de puesto;
- archivos PDF/DOCX;
- API HTTP;
- frontend;
- IA.

## Siguiente paso recomendado

Construir una capa HTTP mínima y la primera UI operable sobre estas APIs:

1. crear/listar puestos;
2. iniciar valoración;
3. cargar metodología demo/configurada;
4. seleccionar niveles por dimensión;
5. mostrar puntos, grado y calculation trace;
6. conservar el flujo manual antes de añadir asistencia de IA.
