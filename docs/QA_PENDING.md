# Compensa — QA pendiente

Actualizado: 2026-08-22

Este archivo registra validaciones que no cubre todavía el CI automatizado y que deben ejecutarse antes de considerar el MVP listo para usuarios externos.

## Cubierto automáticamente en CI

- TypeScript estricto.
- Build de producción de Next.js.
- Motor determinístico y trazabilidad.
- Migraciones PostgreSQL desde cero e idempotencia.
- Persistencia y aislamiento multi-tenant base.
- Concurrencia de versiones de valoración.
- Concurrencia de decisiones.
- Concurrencia de versiones de descriptivo.
- Anclaje de valoración a una versión de descriptivo.
- Evidencia de descriptivo validada contra el texto anclado.
- Rechazo de evidencia textual inventada.
- DRAFT → IN_REVIEW → RETURNED → IN_REVIEW → APPROVED.
- Bloqueo de edición en IN_REVIEW y APPROVED.
- Esquema Better Auth sobre PostgreSQL.
- Creación controlada de usuario y resolución de sesión desde cookie.
- Registro público deshabilitado.
- Memberships activas filtradas por organización activa.
- Matriz ADMIN / EVALUATOR / REVIEWER.
- Actor persistido atómicamente en SUBMITTED / RETURNED / APPROVED.
- Foreign keys e invariantes multi-tenant existentes del dominio.
- Parser de importación histórica Gold Standard y rechazo de atribución directa de experto.
- Importación Gold Standard multi-caso atómica con rollback total ante un caso inválido.
- Reproducción determinística de puntos/grado histórico y rechazo de mismatch.
- Aislamiento de metodología Gold Standard entre tenants.
- Dry-run histórico read-only y detección de códigos de caso existentes.
- Contrato de UI: permiso `MANAGE_GOLD_STANDARD` en página y Server Action, dry-run servidor antes del write e invalidación del preview cuando cambia el payload.

## Pendiente: E2E real de navegador

### Autenticación y permisos

- Ejecutar `npm run bootstrap:admin` sobre una base limpia y confirmar login del primer ADMIN.
- Login correcto e incorrecto desde `/sign-in`.
- Confirmar redirección a `/sign-in` cuando no hay sesión.
- Confirmar logout y rechazo de la sesión cerrada.
- Probar expiración/renovación de sesión en staging.
- Crear usuarios de prueba ADMIN, EVALUATOR y REVIEWER y recorrer la matriz visual de permisos.
- Intentar Server Actions manualmente con un rol sin permiso y confirmar rechazo del backend aunque se manipule el HTML.
- Probar un usuario con memberships en dos organizaciones y confirmar aislamiento al cambiar la organización activa.
- Probar cookie de organización inexistente/no autorizada y confirmar que nunca concede acceso a otro tenant.
- Desactivar un membership y confirmar pérdida inmediata de acceso.
- Desactivar una organización y confirmar pérdida de acceso para todos sus memberships.
- Confirmar que historial de revisión muestra el actor correcto para envío, devolución y aprobación.

### Flujo funcional

- Crear un puesto desde `/jobs/new`.
- Crear descriptivo v1 y confirmar visualmente contenido/origen.
- Crear descriptivo v2 partiendo del texto precargado de v1.
- Iniciar una valoración y confirmar que queda anclada a v2.
- Crear v3 después y confirmar que la valoración sigue mostrando v2.
- Seleccionar y modificar niveles en todas las dimensiones.
- Confirmar que el puntaje no aparece mientras falten decisiones obligatorias.
- Completar las decisiones y validar puntos/grado contra el fixture esperado.
- Registrar justificaciones.
- Añadir evidencia desde descriptivo, entrevista y otra fuente.
- Eliminar evidencia antes del envío.
- Confirmar que el botón de envío permanece deshabilitado si falta una justificación requerida.
- Enviar a revisión como EVALUATOR.
- Confirmar que niveles, justificaciones y evidencias quedan bloqueados en IN_REVIEW.
- Devolver como REVIEWER con comentario obligatorio.
- Editar como EVALUATOR la valoración retornada y reenviar.
- Aprobar como REVIEWER y confirmar inmutabilidad final.
- Revisar historial de workflow y legibilidad de la traza de cálculo.
- Probar layout en móvil y desktop.

### Gold Standard e importación histórica

- Entrar a `/gold-standard/import` como ADMIN y confirmar que muestra la metodología activa, su ID, dimensiones y niveles.
- Intentar abrir `/gold-standard/import` como EVALUATOR y REVIEWER y confirmar rechazo.
- Pegar JSON malformado y confirmar mensaje seguro sin escrituras.
- Previsualizar un lote histórico válido y confirmar puntos/grado por caso.
- Editar el JSON después de un preview válido y confirmar que **Importar lote validado** vuelve a quedar deshabilitado hasta repetir el dry-run.
- Probar un caso con `methodologyVersionId` de otra organización y confirmar que solo se informa como no disponible.
- Importar un lote pequeño anonimizado y confirmar aparición en `/gold-standard` con el resultado y partición esperados.
- Intentar un `caseCode` duplicado y confirmar bloqueo sin escrituras parciales.
- Forzar un segundo caso inválido en un lote y confirmar rollback total en la UI/DB.
- Confirmar que la importación exitosa crea `GOLD_STANDARD_HISTORICAL_IMPORT` en `security_audit_events`.
- Si la UI reporta una advertencia de auditoría, revisar logs del servidor antes de aceptar el entorno como listo.
- Revisar legibilidad de tablas de preview y códigos de metodología en móvil y desktop.
- No utilizar nombres de trabajadores, desempeño individual ni remuneraciones reales en el QA manual.

## Pendiente antes de exposición pública

- Manejo de errores de Server Actions con mensajes de usuario en lugar de error genérico.
- Pruebas de accesibilidad y navegación por teclado.
- E2E automatizado con navegador.
- Recovery de contraseña y estrategia de correo transaccional antes de onboarding externo.
- Revisar necesidad de MFA/SSO según tipo de cliente.
- Rate limiting distribuido si staging/producción pasa a múltiples instancias.
- Estrategia de backup/restore de PostgreSQL y prueba real de restauración.
- Gestión segura y rotación de `BETTER_AUTH_SECRET` y credenciales de base de datos.
- HTTPS, cookies secure y headers de seguridad verificados en staging.
- Despliegue de staging aislado antes de producción.
