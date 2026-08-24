# Compensa — QA pendiente

Actualizado: 2026-08-23

Este archivo es el inventario único de validaciones conocidas que **todavía no cubre el CI automatizado**. Deben ejecutarse antes de considerar Compensa listo para usuarios externos/producción. Si una prueba pasa posteriormente, debe moverse fuera de las secciones pendientes en el mismo cambio que la automatiza o documenta.

## Cubierto automáticamente en CI

- Instalación reproducible con `package-lock.json` + `npm ci` en CI y Docker.
- TypeScript estricto.
- Build de producción de Next.js.
- Motor determinístico, traza y validación del DSL restringido.
- Migraciones PostgreSQL desde cero, checksums e idempotencia.
- Persistencia y aislamiento multi-tenant base.
- Concurrencia de versiones de valoración, decisiones y descriptivos.
- Anclaje de valoración a una versión de descriptivo.
- Evidencia de descriptivo validada contra el texto anclado y rechazo de evidencia textual inventada.
- DRAFT → IN_REVIEW → RETURNED → IN_REVIEW → APPROVED.
- Bloqueo de edición en IN_REVIEW y APPROVED.
- Esquema Better Auth sobre PostgreSQL, creación controlada de usuario y resolución de sesión desde cookie.
- Registro público deshabilitado.
- Memberships activas filtradas por organización activa.
- Matriz ADMIN / EVALUATOR / REVIEWER y actor transaccional en SUBMITTED / RETURNED / APPROVED.
- Foreign keys e invariantes multi-tenant existentes del dominio.
- Gold Standard: parser histórico, importación multi-caso atómica, reproducción determinística, rollback, aislamiento tenant, dry-run y protección SQL de snapshots validados.
- Contrato UI Gold Standard: permiso `MANAGE_GOLD_STANDARD`, dry-run servidor antes del write e invalidación del preview JSON al cambiar payload.
- Administración de metodologías: parser estructural, DSL permitido, dry-run, duplicados, aislamiento tenant, concurrencia e inmutabilidad SQL de versiones publicadas.
- Selección de metodología ACTIVE al iniciar nuevas valoraciones.
- Importaciones Excel/CSV: parsers tabulares, CSV con coma/punto y coma/tabulación, agrupación Gold Standard, conversión de metodología tabular al contrato canónico, rechazo de fórmulas XLSX y pruebas de plantillas.
- Round-trip PostgreSQL de metodología importada desde spreadsheet → Gold Standard importado desde spreadsheet.
- Contrato UI/server de spreadsheet: permisos ADMIN, dry-run repetido antes de escribir, tipos `.xlsx/.csv` e invalidación visual cuando cambia el archivo/origen.

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

### Flujo funcional de valoración

- Crear un puesto desde `/jobs/new`.
- Crear descriptivo v1 y confirmar visualmente contenido/origen.
- Crear descriptivo v2 partiendo del texto precargado de v1.
- Iniciar una valoración y confirmar que queda anclada a v2.
- Crear v3 después y confirmar que la valoración sigue mostrando v2.
- Seleccionar una metodología ACTIVE distinta del fixture demo y confirmar que la valoración usa exactamente esa versión.
- Seleccionar y modificar niveles en todas las dimensiones.
- Confirmar que el puntaje no aparece mientras falten decisiones obligatorias.
- Completar las decisiones y validar puntos/grado contra el resultado esperado.
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

### Administración de metodologías

- Entrar a `/methodologies` y `/methodologies/import` como ADMIN.
- Confirmar rechazo visual/backend para EVALUATOR y REVIEWER en operaciones de administración.
- Importar una metodología propia/autorizada válida desde JSON y confirmar catálogo/uso en una valoración.
- Intentar un código+versión duplicado y confirmar mensaje de usuario y ausencia de segunda fila.
- Crear una nueva versión del mismo código y confirmar convivencia histórica.
- Retirar una versión ACTIVE y confirmar que ya no aparece para nuevas valoraciones pero sigue disponible en valoraciones/Gold Standard históricos ya anclados.
- Confirmar que una versión RETIRED no puede reactivarse ni editarse por vías administrativas/directas.
- Revisar copy de derechos/licencia con material de prueba no propietario.

### Gold Standard e importación histórica JSON

- Entrar a `/gold-standard/import` como ADMIN y confirmar listado de metodologías activas, IDs, dimensiones y niveles.
- Intentar abrir `/gold-standard/import` como EVALUATOR y REVIEWER y confirmar rechazo.
- Pegar JSON malformado y confirmar mensaje seguro sin escrituras.
- Previsualizar un lote histórico válido y confirmar puntos/grado por caso.
- Editar JSON después de preview válido y confirmar que **Importar lote validado** vuelve a quedar deshabilitado.
- Probar `methodologyVersionId` de otra organización y confirmar que solo se informa como no disponible.
- Importar un lote pequeño anonimizado y confirmar aparición en `/gold-standard` con resultado/partición esperados.
- Intentar `caseCode` duplicado y confirmar bloqueo sin escrituras parciales.
- Forzar un segundo caso inválido en un lote y confirmar rollback total en UI/DB.
- Confirmar creación de `GOLD_STANDARD_HISTORICAL_IMPORT` en `security_audit_events`.
- Si la UI reporta advertencia de auditoría, revisar logs antes de aceptar el entorno.
- Revisar legibilidad de preview y códigos en móvil/desktop.

### Excel / CSV — Gold Standard

- Descargar `/api/templates/gold-standard.xlsx` y abrirla en Microsoft Excel desktop.
- Abrir la misma plantilla en LibreOffice Calc y confirmar que hojas/encabezados/instrucciones se conservan.
- Descargar plantilla CSV y confirmar UTF-8/acentos al abrir en Excel con configuración regional española/Perú.
- Guardar desde Excel un CSV separado por `;`, subirlo y confirmar detección automática del delimitador.
- Completar 2–5 casos reales anonimizados en XLSX, ejecutar preview y cotejar manualmente decisiones, evidencias, puntos y grado.
- Repetir una dimensión en varias filas para cargar múltiples evidencias y confirmar agrupación correcta.
- Cambiar de archivo después de un preview válido y confirmar que el botón de importación queda bloqueado hasta repetir dry-run.
- Intentar fórmula en una celda del XLSX y confirmar mensaje de rechazo entendible en navegador.
- Probar un archivo con columnas requeridas faltantes, booleano inválido, número inválido y metadatos contradictorios dentro del mismo caso.
- Importar un lote válido y confirmar `GOLD_STANDARD_SPREADSHEET_IMPORT` en auditoría.
- Confirmar que un lote con un caso inválido no deja escrituras parciales.
- Probar layout/tabla de errores con nombres/descriptivos largos en móvil y desktop.

### Excel / CSV — metodologías

- Descargar `/api/templates/methodology.xlsx` y abrirla en Microsoft Excel y LibreOffice.
- Confirmar que la hoja `Methodology` vacía es la importable y `Ejemplo` no se procesa accidentalmente.
- Completar una metodología ficticia pequeña en XLSX y verificar preview: factores, dimensiones, niveles, pasos y grados.
- Repetir la misma prueba en CSV separado por coma y por punto y coma.
- Cambiar archivo u origen/propietario después del preview y confirmar bloqueo hasta repetir dry-run.
- Desmarcar confirmación de derechos y confirmar que el backend no importa aunque el archivo sea válido.
- Probar STEP inválido, referencia a factor/dimensión/paso inexistente, lookup duplicado y rangos de grado superpuestos.
- Importar versión válida y confirmar que aparece en `/methodologies` y puede seleccionarse al iniciar una valoración.
- Confirmar creación de `METHODOLOGY_SPREADSHEET_IMPORTED` en auditoría.
- Revisar mensajes y tablas en móvil/desktop.

## Pendiente: seguridad/robustez de uploads antes de exposición pública

- Ejecutar pruebas adversariales de XLSX comprimido/zip bomb y definir límite de ratio/tamaño descomprimido antes de aceptar uploads anónimos o de clientes no confiables.
- Evaluar escaneo antimalware/AV de uploads si en el futuro se persisten archivos originales; hoy Compensa procesa en memoria y no conserva el archivo.
- Rate limiting y cuota por usuario/organización para endpoints/actions de upload.
- Verificar consumo máximo de memoria/CPU con archivos cercanos a 5 MiB y 5.000 filas en el tamaño de VPS objetivo.
- Prueba de carga concurrente de múltiples uploads grandes.
- Confirmar que archivos XLSX con objetos/links externos/macros no producen accesos externos ni contenido persistido inesperado; `.xlsm` no está admitido y debe seguir rechazado.
- Revisar política de retención/logs para evitar que errores de parsing vuelquen contenido sensible de celdas.

## Pendiente antes de exposición pública

- Manejo consistente de errores de todas las Server Actions con mensajes de usuario en lugar de error genérico.
- Pruebas de accesibilidad, lectores de pantalla y navegación por teclado.
- E2E automatizado con navegador (Playwright u opción equivalente).
- Recovery de contraseña y estrategia de correo transaccional antes de onboarding externo.
- Revisar necesidad de MFA/SSO según tipo de cliente.
- Rate limiting distribuido si staging/producción pasa a múltiples instancias.
- Estrategia de backup/restore PostgreSQL y prueba real de restauración.
- Gestión segura y rotación de `BETTER_AUTH_SECRET` y credenciales de base de datos.
- HTTPS, cookies secure, CSP/headers y reverse proxy verificados en staging.
- Despliegue de staging aislado y ejecución del checklist anterior antes de producción.
- Separar definitivamente migraciones/bootstrap demo de los permisos DDL de la app runtime antes de un SaaS multi-tenant externo.
