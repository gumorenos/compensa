# Compensa — staging con Docker Compose

Actualizado: 2026-08-21

Este procedimiento crea un entorno de staging aislado para ejecutar el QA manual de Stage 1. No es una guía de producción pública.

## Topología

```text
Internet / navegador
       |
       | HTTPS
       v
reverse proxy / tunnel
       |
       | 127.0.0.1:${COMPENSA_PORT:-3100}
       v
   Compensa app
       |
       | red Docker privada
       v
 PostgreSQL 18.4
```

PostgreSQL no publica puertos al host. La aplicación se publica únicamente en loopback para obligar a colocar TLS/reverse proxy o un túnel delante.

## Requisitos

- Linux x86_64 o arm64 con Docker Engine y Docker Compose v2.
- Git.
- Un hostname HTTPS para staging.
- Acceso local al host para ejecutar Docker y guardar secretos.

## 1. Preparar el checkout

Trabajar desde un commit conocido, no desde una rama que pueda moverse durante QA.

```bash
git clone https://github.com/gumorenos/compensa.git
cd compensa
git fetch --all --prune
git checkout <COMMIT_SHA_APROBADO>
```

## 2. Crear variables de staging

```bash
cp .env.staging.example .env.staging
chmod 600 .env.staging
```

Generar secretos nuevos para staging. Un password hexadecimal evita tener que URL-encodear caracteres reservados dentro de `DATABASE_URL`:

```bash
openssl rand -hex 32
openssl rand -base64 48
```

Editar `.env.staging` y definir como mínimo:

- `POSTGRES_PASSWORD`
- `DATABASE_URL=postgres://compensa:<POSTGRES_PASSWORD>@db:5432/compensa`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=https://<hostname-staging>`
- `COMPENSA_ADMIN_EMAIL`
- `COMPENSA_ADMIN_PASSWORD`
- `COMPENSA_ORG_SLUG`
- `COMPENSA_ORG_NAME`

No reutilizar secretos de CI, desarrollo ni producción.

## 3. Validar configuración sin arrancar nada

```bash
docker compose \
  --env-file .env.staging \
  -f compose.staging.yml \
  --profile ops \
  config >/dev/null
```

El comando debe terminar con código 0. Revisar además que `.env.staging` no aparezca en `git status`.

## 4. Construir imágenes

```bash
docker compose \
  --env-file .env.staging \
  -f compose.staging.yml \
  build app migrate bootstrap
```

La imagen de aplicación es un Next.js standalone. Los valores de auth usados durante `next build` dentro del Dockerfile son placeholders no secretos y son reemplazados por las variables reales al arrancar el contenedor.

## 5. Arrancar PostgreSQL

```bash
docker compose \
  --env-file .env.staging \
  -f compose.staging.yml \
  up -d db
```

Verificar:

```bash
docker compose --env-file .env.staging -f compose.staging.yml ps
```

`db` debe quedar `healthy`.

## 6. Aplicar migraciones

Ejecutar en cada release:

```bash
docker compose \
  --env-file .env.staging \
  -f compose.staging.yml \
  --profile ops \
  run --rm migrate
```

`db:migrate` es idempotente y valida los checksums ya aplicados. Una migración previamente aplicada cuyo contenido cambie debe detener el deploy con error; nunca corregir ese error editando manualmente `schema_migrations`.

## 7. Provisioning inicial del ADMIN

Solo para el primer provisioning o una recuperación administrativa intencional:

```bash
docker compose \
  --env-file .env.staging \
  -f compose.staging.yml \
  --profile ops \
  run --rm bootstrap
```

El bootstrap crea/reutiliza la organización, crea la cuenta mediante Better Auth y deja su membership como `ADMIN`. No usar este comando automáticamente en cada deploy.

## 8. Arrancar Compensa

```bash
docker compose \
  --env-file .env.staging \
  -f compose.staging.yml \
  up -d app
```

Comprobar el healthcheck local:

```bash
curl -fsS http://127.0.0.1:${COMPENSA_PORT:-3100}/api/health
```

Resultado esperado:

```json
{"status":"ok"}
```

Sin sesión, `/` debe redirigir a `/sign-in`.

## 9. Publicar exclusivamente mediante HTTPS

Configurar el reverse proxy o túnel para enviar el hostname definido en `BETTER_AUTH_URL` a:

```text
http://127.0.0.1:${COMPENSA_PORT:-3100}
```

Requisitos:

- HTTPS obligatorio para staging accesible desde Internet.
- No publicar el puerto PostgreSQL.
- No cambiar `BETTER_AUTH_URL` a una URL interna; debe ser el origin HTTPS que ve el navegador.
- Restringir staging adicionalmente por VPN/Access/IP allowlist si está disponible.

## 10. QA mínimo post-deploy

Antes de iniciar el checklist completo de `docs/QA_PENDING.md`:

1. `/api/health` devuelve 200.
2. `/` sin sesión redirige a login.
3. login del ADMIN funciona.
4. crear un puesto de prueba.
5. crear un descriptivo.
6. iniciar una valoración.
7. cerrar sesión y comprobar que el recurso ya no puede consultarse.
8. revisar `docker compose ps` y logs sin errores repetitivos.

Logs:

```bash
docker compose --env-file .env.staging -f compose.staging.yml logs --tail=200 app
docker compose --env-file .env.staging -f compose.staging.yml logs --tail=200 db
```

## Backup antes de actualizar staging con datos útiles

Crear un dump consistente:

```bash
mkdir -p backups
chmod 700 backups

docker compose \
  --env-file .env.staging \
  -f compose.staging.yml \
  exec -T db \
  pg_dump -U compensa -d compensa -Fc \
  > "backups/compensa-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Verificar que el archivo no esté vacío:

```bash
test -s backups/compensa-*.dump
```

Los dumps contienen información sensible y no deben entrar al repositorio.

## Actualización de staging

1. Crear backup si existen datos que deban conservarse.
2. Obtener el nuevo commit aprobado.
3. Construir la nueva imagen.
4. Ejecutar `migrate`.
5. Recrear `app`.
6. Verificar `/api/health` y el smoke funcional.

Ejemplo:

```bash
git fetch --all --prune
git checkout <NUEVO_COMMIT_APROBADO>

docker compose --env-file .env.staging -f compose.staging.yml build app migrate
docker compose --env-file .env.staging -f compose.staging.yml --profile ops run --rm migrate
docker compose --env-file .env.staging -f compose.staging.yml up -d app
curl -fsS http://127.0.0.1:${COMPENSA_PORT:-3100}/api/health
```

## Rollback de aplicación

Si una nueva imagen falla y las migraciones aplicadas son compatibles hacia atrás:

```bash
git checkout <COMMIT_ANTERIOR>
docker compose --env-file .env.staging -f compose.staging.yml build app
docker compose --env-file .env.staging -f compose.staging.yml up -d app
```

No ejecutar `down -v`: `-v` elimina el volumen PostgreSQL.

Si el rollback exige volver el esquema atrás, restaurar un backup en un entorno limpio. Las migraciones de Compensa son forward-only; no se deben improvisar downgrades sobre una base con datos.

## Stop point de Stage 1

Staging no se considera validado hasta completar el bloque E2E/RBAC de `docs/QA_PENDING.md`. En particular faltan pruebas reales con cuentas separadas `EVALUATOR` y `REVIEWER`, aislamiento multi-organización, UX de errores, accesibilidad y restauración de backup.
