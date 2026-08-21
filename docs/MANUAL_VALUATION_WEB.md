# Compensa — primera interfaz manual de valoración

Fecha: 2026-08-20

## Objetivo

Hacer operable en navegador el núcleo ya implementado, sin incorporar todavía IA ni autenticación. La interfaz debe probar que un especialista puede crear un puesto, iniciar una valoración, seleccionar niveles y obtener un resultado calculado por el motor determinístico.

## Stack

- Next.js 16.3
- React 19.2
- Server Components
- Server Actions
- PostgreSQL 18
- CSS propio, sin framework visual

## Flujo implementado

```text
Puestos
  ↓
Nuevo puesto
  ↓
Detalle del puesto
  ↓
Iniciar valoración
  ↓
Factores / dimensiones / niveles
  ↓
Guardar cada decisión
  ↓
Motor determinístico
  ↓
Puntos + grado + calculation trace
```

## Decisiones de diseño

### La UI no calcula

Los botones de nivel envían una Server Action. La acción llama a `ValuationService`, que valida/persiste la decisión y ejecuta el motor existente cuando la valoración está completa.

### Sin SPA por ahora

No se incorpora store de cliente ni lógica duplicada. La fuente de verdad sigue en PostgreSQL y el backend. Esto reduce el riesgo de divergencia entre pantalla y cálculo.

### Tenant demo temporal

Mientras no exista autenticación, la web inicial usa una organización de desarrollo `compensa-demo`, creada de forma idempotente junto con la metodología ficticia. Esto es únicamente una solución de bootstrap para probar producto; no es el modelo final de tenancy ni onboarding.

### Metodología ficticia

La pantalla usa `Demo Point Factor`, fixture original del repositorio. No se distribuye contenido propietario de metodologías comerciales.

### Sin descriptivo ni IA todavía

La intención de esta etapa es obtener una valoración manual completa y trazable. Descriptivos, evidencia e IA entran después de estabilizar el flujo base.

## Pantallas

- `/` — listado de puestos y último resultado.
- `/jobs/new` — creación de puesto.
- `/jobs/[jobId]` — detalle e inicio de valoración.
- `/valuations/[valuationId]` — workspace manual de valoración.

## Definition of Done

- la app compila en producción;
- puede crear un puesto;
- puede iniciar una valoración con metodología activa;
- puede guardar niveles por dimensión;
- muestra progreso sin inventar puntos parciales;
- al completar la valoración muestra puntos y grado;
- muestra la traza del cálculo retornada por el motor;
- los tests del núcleo y persistencia continúan pasando.

## Pendiente deliberado

- login / sesiones;
- roles;
- onboarding multi-tenant real;
- descriptivos de puesto;
- evidencia y justificaciones desde UI;
- workflow IN_REVIEW / APPROVED;
- edición de metodologías;
- IA;
- pruebas E2E con navegador.
