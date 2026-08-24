# Navegación y RBAC

La navegación principal de Compensa es consciente del rol de la membresía activa. Esto mejora la UX, pero **no es un control de seguridad por sí mismo**: cada página, Server Action y endpoint sensible debe seguir validando su permiso en backend.

## Resolución del contexto

`app/app-nav-links.tsx` usa la misma ruta de autorización del resto de la aplicación:

```text
request
  → sesión Better Auth
  → membership activa
  → organización activa
  → requireRequestAccess("VIEW")
  → rol
  → links visibles
```

No se mantiene una segunda matriz de permisos para navegación.

Si no existe sesión/membership válida, `AppNavLinks` no renderiza links de aplicación. Errores inesperados que no sean `AccessError` no se ocultan y siguen propagándose.

## Links actuales

| Destino | ADMIN | EVALUATOR | REVIEWER |
| --- | --- | --- | --- |
| Puestos | Sí | Sí | Sí |
| Metodologías | Sí | Sí | Sí |
| Gold Standard | Sí | No | No |
| Calibración | Sí | Sí | Sí |

Gold Standard se condiciona a `MANAGE_GOLD_STANDARD`, que hoy solo posee ADMIN. Esto evita presentar a EVALUATOR/REVIEWER una ruta que contiene las referencias expertas usadas por HOLDOUT.

## Defensa en profundidad

Aunque un usuario escriba manualmente `/gold-standard`, conozca un `caseId` o manipule el HTML, listado, detalle, importación y dashboard de cobertura vuelven a exigir `MANAGE_GOLD_STANDARD` en servidor.

Las corridas de calibración pueden seguir visibles a roles normales. Mientras un HOLDOUT está `DRAFT`, la UI de la corrida no entrega decisiones expertas, puntos, grado ni métricas de referencia.

## Cambio de organización

La navegación se calcula con la membresía activa de la request. Cuando exista una UX completa de cambio de organización, debe verificarse en navegador que el layout se refresque inmediatamente y que los links correspondan al rol de la nueva organización. Esa validación permanece en `docs/QA_PENDING.md`.
