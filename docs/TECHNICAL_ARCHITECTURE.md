# Compensa — arquitectura técnica Stage 1

Fecha: 2026-08-20
Estado: decisión inicial implementable

## Objetivo

Construir primero un núcleo determinístico, testeable y desacoplado de UI, base de datos e IA. La primera prueba de producto es que una misma metodología + las mismas selecciones produzcan exactamente el mismo resultado y una traza explicable.

## Stack propuesto

- TypeScript para dominio, backend y frontend.
- PostgreSQL para persistencia cuando se incorpore la capa de datos.
- Next.js para la futura aplicación web full-stack.
- Vitest para pruebas del dominio.
- Zod en el borde de entrada cuando se incorporen API/configuración externa.
- Docker para despliegue posterior.

No se necesita framework web para desarrollar ni probar el motor de valoración.

## Separación por capas

```text
UI / API
   ↓
Application services
   ↓
Domain
  ├─ methodology definition
  ├─ valuation selections
  ├─ scoring engine
  ├─ validation
  └─ scoring trace
   ↓
Infrastructure
  ├─ PostgreSQL
  ├─ files
  └─ AI providers
```

Regla: `domain` no importa nada desde UI, base de datos o proveedores de IA.

## Metodología como configuración

El motor no conoce Hay, Mercer ni ningún otro método por nombre. Recibe una definición declarativa con:

- factores;
- dimensiones;
- niveles;
- pasos de cálculo;
- tablas de consulta;
- grado/rango final.

Compensa no incluirá en el repositorio tablas ni textos propietarios de terceros. Los fixtures incluidos durante desarrollo serán ficticios y originales.

## DSL de scoring v1

No se permitirán expresiones JavaScript ni `eval`. El cálculo se expresa como pasos restringidos.

Tipos iniciales:

### `lookup`

Convierte una combinación de selecciones o resultados anteriores en un valor mediante una tabla explícita.

### `sum`

Suma referencias o constantes.

### `multiply`

Multiplica referencias o constantes.

### `divide`

Divide dos operandos con validación de división entre cero.

### `round`

Redondea un resultado previo a una precisión definida.

Esto permite representar procesos donde un valor depende de varias dimensiones y, posteriormente, donde un factor depende matemáticamente de otro, sin ejecutar código arbitrario almacenado en base de datos.

## Resultado del motor

El motor devolverá:

```text
status
points
grade
trace[]
errors[]
warnings[]
```

La `trace` es obligatoria. Cada paso debe registrar inputs y output para poder explicar cómo se obtuvo el resultado.

## Validaciones v1

Antes del cálculo:

1. códigos únicos de factor/dimensión/nivel;
2. toda dimensión requerida tiene selección;
3. nivel seleccionado existe dentro de su dimensión;
4. referencias de pasos apuntan a dimensiones o pasos existentes;
5. claves requeridas existen en las tablas de lookup;
6. rangos de grados son válidos y no se superponen.

Durante el cálculo:

1. no usar resultados inexistentes;
2. no dividir entre cero;
3. no producir `NaN` o infinito;
4. una tabla sin combinación configurada genera error explícito, nunca una aproximación.

## Persistencia prevista

El Stage 1 comenzará con dominio puro. Después se incorporarán tablas equivalentes a:

```text
organizations
jobs
job_descriptions
methodologies
methodology_versions
valuations
valuation_decisions
valuation_events
```

Una valoración siempre queda vinculada a una versión inmutable de metodología.

## Multi-tenancy

La persistencia deberá incluir `organization_id` en todas las entidades pertenecientes a cliente y aplicar aislamiento en servicios/repositorios. No se pospone conceptualmente el multi-tenant aunque el primer prototipo tenga una sola organización.

## IA

La IA no entra en Stage 1. Más adelante consumirá únicamente:

- descriptivo autorizado;
- definiciones de dimensión/niveles autorizadas;
- contexto explícitamente permitido.

Su salida será una sugerencia. Nunca podrá escribir puntos directamente.

## Estructura inicial del repositorio

```text
src/
  domain/
    methodology.ts
    scoring-engine.ts
    errors.ts
  fixtures/
    demo-methodology.ts

tests/
  scoring-engine.test.ts

docs/
```

## Definition of Done — primer incremento

- existe un formato declarativo de metodología;
- existe un fixture ficticio;
- el motor calcula de forma determinística;
- devuelve traza de cálculo;
- identifica un grado por rango;
- falla explícitamente ante selecciones inválidas o tablas incompletas;
- las pruebas cubren happy path y errores principales;
- no existe ninguna dependencia con IA ni material propietario.
