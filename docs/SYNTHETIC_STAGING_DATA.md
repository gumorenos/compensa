# Compensa — datos sintéticos para QA de staging

Este fixture es opcional y existe únicamente para poblar staging con datos ficticios que permitan probar la interfaz y los flujos sin usar información real de empleados o empresas.

## Qué crea

En la organización indicada por `COMPENSA_ORG_SLUG` crea, si aún no existen:

- 7 puestos con código `SYN-DEMO-*`, nombre marcado como `(sintético)` y descriptivo `SYNTHETIC_DEMO_V1`;
- 7 valoraciones distribuidas entre borrador parcial, borrador completo, en revisión, devuelta y aprobada;
- resultados determinísticos que cubren grados G1 a G5 de `DEMO_POINT_FACTOR 1.0.0`;
- 3 casos Gold Standard validados `SYN-GS-*`: dos de calibración y uno HOLDOUT.

Los casos Gold Standard incluyen la nota `SYNTHETIC / DEMO ONLY` y no representan criterio experto, benchmark de mercado ni metodología propietaria.

## Requisitos

- organización de staging ya provisionada;
- metodología activa `DEMO_POINT_FACTOR 1.0.0` creada por el bootstrap;
- migraciones aplicadas.

El seed no crea organizaciones, usuarios ni metodologías y no ejecuta migraciones.

## Ejecutar en staging

Desde el checkout del SHA aprobado:

```bash
docker compose \
  --env-file .env.staging \
  -f compose.staging.yml \
  --profile demo \
  run --rm demo-seed
```

La ejecución es explícita: el comando de CLI se niega a correr salvo que `COMPENSA_DEMO_SEED_ENABLED=true`; el servicio `demo-seed` configura esa bandera únicamente dentro del perfil `demo`.

## Reejecución y datos modificados manualmente

El seed es no destructivo:

- no usa `TRUNCATE` ni `DELETE`;
- no duplica los puestos, descriptivos, valoraciones o casos Gold Standard que ya creó;
- no retrocede estados de workflow;
- si una valoración sintética editable tiene una selección distinta del fixture, la marca como personalizada y no la sobrescribe.

Por ello los registros pueden utilizarse para QA manual después de la primera carga. Una reejecución no debe usarse como mecanismo de reset; para volver a un estado inicial se debe restaurar un backup de staging o usar un entorno desechable.

## No usar en producción

No ejecutar este fixture en una organización productiva. El prefijo `SYN-*` y las etiquetas visibles existen para que cualquier dato generado sea inequívocamente identificable como sintético.
