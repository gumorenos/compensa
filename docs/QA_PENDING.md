# Compensa — QA pendiente

Actualizado: 2026-08-21

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

## Pendiente: E2E real de navegador

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
- Enviar a revisión.
- Confirmar que niveles, justificaciones y evidencias quedan bloqueados en IN_REVIEW.
- Devolver con comentario obligatorio.
- Editar la valoración retornada y reenviar.
- Aprobar y confirmar inmutabilidad final.
- Revisar historial de workflow y legibilidad de la traza de cálculo.
- Probar layout en móvil y desktop.

## Pendiente antes de exposición pública

- Autenticación real.
- RBAC y separación efectiva entre evaluador/revisor/admin.
- Identidad del actor en el audit trail.
- Protección CSRF/session según el mecanismo de autenticación elegido.
- Manejo de errores de Server Actions con mensajes de usuario en lugar de error genérico.
- Pruebas de accesibilidad y navegación por teclado.
- E2E automatizado con navegador.
- Estrategia de backup/restore de PostgreSQL.
- Despliegue de staging aislado antes de producción.
