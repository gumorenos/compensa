# Bandeja de Valoraciones

`/valuations` es la cola operativa de procesos de valoración de la organización activa.

## Objetivo

La pantalla de Puestos responde “¿qué puestos existen y cuál es su última valoración?”. La bandeja de Valoraciones responde una pregunta distinta: “¿qué procesos de valoración existen y cuáles requieren atención?”.

Cada fila representa una versión concreta de `valuations`; nunca se colapsan silenciosamente varias versiones del mismo puesto.

## Alcance de consulta

La fuente son exclusivamente valoraciones operativas de la organización activa. La consulta no usa Gold Standard, CALIBRATION ni HOLDOUT.

La vista requiere el permiso general `VIEW` y es de solo lectura. Abrir una fila lleva a la valoración histórica exacta, donde siguen aplicando los permisos y estados del workflow normal.

## Campos visibles

- puesto y código;
- versión de valoración;
- área/departamento y familia;
- estado;
- puntos y grado cuando existen;
- metodología y versión exacta;
- usuario que inició la valoración cuando existe auditoría `VALUATION_STARTED`;
- fecha/hora de última actualización;
- enlace a la valoración fuente.

Los históricos sin evento de inicio auditado continúan siendo válidos. En esos casos `Iniciada por` se muestra vacío; Compensa no inventa autoría retroactiva.

## Filtros

La URL admite filtros GET por:

- búsqueda de nombre/código de puesto;
- estado;
- área;
- familia;
- grado;
- versión metodológica;
- usuario que inició la valoración;
- fecha de actualización desde/hasta.

Los UUID, estados y fechas se validan antes de construir los parámetros SQL. Una URL manipulada o malformada no se envía a casts PostgreSQL; la UI descarta los filtros y muestra una advertencia genérica.

Todos los filtros SQL son parametrizados y mantienen `organization_id` como frontera obligatoria.

## Fechas

Mientras `Organization` no tenga timezone configurado, los filtros de fecha se interpretan explícitamente en **UTC** y la UI lo indica. Esto evita depender del timezone del proceso PostgreSQL/Node. Una futura configuración regional por organización podrá sustituir esta convención sin cambiar el significado histórico de `updated_at`.

## Conteos por estado

Los contadores DRAFT / IN_REVIEW / RETURNED / APPROVED / SUPERSEDED / CANCELLED representan el total del tenant y no el subconjunto filtrado. Funcionan como panorama operativo estable y como accesos rápidos por estado.

## Límite de resultados

La consulta calcula el total real de coincidencias, pero renderiza como máximo 200 filas. Cuando el resultado supera ese límite, la UI lo declara explícitamente.

Este límite evita una respuesta HTML/consulta inicial sin cota. Antes de clientes con volúmenes altos debe sustituirse por paginación estable o cursor server-side; no se debe aumentar indefinidamente el límite.

## Actor de inicio

No se añadió una columna mutable `created_by` a `valuations`. Para datos creados desde el flujo web actual, el iniciador se deriva del primer evento de seguridad:

```text
action = VALUATION_STARTED
resource_type = VALUATION
resource_id = valuation.id
```

El actor es informativo y puede ser `null` para datos creados antes de esta auditoría o por procesos que no emitieron ese evento.

## No objetivos

- asignar tareas o responsables;
- modificar estado desde la tabla;
- SLA, vencimientos o escalaciones;
- paginación avanzada;
- notificaciones;
- score de prioridad automático;
- IA;
- mezclar referencias Gold Standard/HOLDOUT con trabajo operativo.

Una etapa posterior puede añadir asignación/SLA cuando exista una necesidad real de workflow multiusuario, manteniendo la trazabilidad y sin inferir responsabilidad a partir del último editor.
