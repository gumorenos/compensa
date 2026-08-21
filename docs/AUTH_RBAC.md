# Compensa — autenticación, RBAC y bootstrap

Actualizado: 2026-08-21

## Objetivo

La autenticación identifica al usuario; `organization_memberships` decide qué puede hacer dentro de cada organización. Compensa no usa el rol del proveedor de autenticación como autoridad de negocio.

La organización activa elegida por la interfaz tampoco concede acceso por sí sola: cada request protegido vuelve a comprobar sesión, membership activa, organización activa y permiso requerido.

## Variables obligatorias

```env
DATABASE_URL=postgres://...
BETTER_AUTH_SECRET=<secreto aleatorio de al menos 32 caracteres>
BETTER_AUTH_URL=https://<host-de-compensa>
```

Para el bootstrap inicial también se requieren:

```env
COMPENSA_ADMIN_EMAIL=admin@example.com
COMPENSA_ADMIN_PASSWORD=<contraseña de al menos 12 caracteres>
COMPENSA_ADMIN_NAME=Administrador
COMPENSA_ORG_SLUG=mi-empresa
COMPENSA_ORG_NAME=Mi Empresa
```

`COMPENSA_ADMIN_NAME`, `COMPENSA_ORG_SLUG` y `COMPENSA_ORG_NAME` tienen valores por defecto para desarrollo, pero deben definirse explícitamente en staging/producción.

## Primer administrador

El registro público permanece deshabilitado. Después de aplicar las migraciones, ejecutar una sola vez:

```bash
npm run bootstrap:admin
```

El comando:

1. aplica migraciones pendientes;
2. crea o reutiliza la organización;
3. crea la metodología ficticia de demo si todavía no existe;
4. crea la cuenta mediante Better Auth si no existe;
5. crea o reactiva el membership `ADMIN`.

No existe un flujo web de “primer usuario = administrador”.

## Roles y permisos

| Permiso | ADMIN | EVALUATOR | REVIEWER |
| --- | --- | --- | --- |
| Ver datos de la organización | Sí | Sí | Sí |
| Crear/editar puestos y descriptivos | Sí | Sí | No |
| Crear y editar valoraciones | Sí | Sí | No |
| Enviar a revisión | Sí | Sí | No |
| Aprobar/devolver | Sí | No | Sí |
| Gestionar miembros | Sí | No | No |

La interfaz oculta controles que el rol no puede usar, pero la seguridad real está en los Server Actions: cada mutación ejecuta de nuevo la autorización en servidor.

## Sesiones

- Email + contraseña.
- Contraseña: 12–128 caracteres.
- Sesión: 7 días.
- Renovación: 24 horas.
- Rate limit general habilitado y límite más estricto para login.
- CSRF y origin checks de Better Auth permanecen habilitados.
- Cookies usan el prefijo `compensa` y las protecciones de Better Auth.

## Auditoría

Las acciones sensibles escriben `security_audit_events` con:

- `organization_id`;
- `actor_user_id`;
- acción;
- tipo/id de recurso;
- payload estructurado;
- timestamp.

Las transiciones `SUBMITTED`, `RETURNED` y `APPROVED` guardan además el actor dentro del mismo transaction boundary que cambia el estado de la valoración. Si no puede registrarse el actor autenticado, la transición completa revierte.

## Multi-tenant

Los IDs enviados por formularios no seleccionan el tenant. El tenant se resuelve desde una sesión válida y un membership activo. Las queries de puestos/valoraciones continúan incluyendo `organization_id`, y las foreign keys del dominio también preservan consistencia entre organización y recurso.

## Fuera de alcance de este incremento

- invitaciones de usuarios;
- recuperación de contraseña / correo transaccional;
- MFA/2FA;
- SSO empresarial;
- UI de administración de miembros;
- políticas avanzadas de sesión por cliente;
- rate limiting distribuido para despliegues multi-instancia.

Estos puntos pueden añadirse después del QA de staging sin bloquear el cierre del núcleo manual Stage 1.
