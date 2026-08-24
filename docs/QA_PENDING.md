# Compensa — QA pendiente

Actualizado: 2026-08-24

Este archivo es el inventario único de validaciones conocidas que **todavía no cubre el CI automatizado**. Deben ejecutarse antes de considerar Compensa listo para usuarios externos/producción. Si una prueba pasa posteriormente, debe moverse fuera de las secciones pendientes en el mismo cambio que la automatiza o documenta.

## Cubierto automáticamente en CI

- Instalación reproducible con `package-lock.json` + `npm ci` en CI y Docker.
- TypeScript estricto y build de producción Next.js.
- Motor determinístico, traza y DSL restringido.
- Migraciones PostgreSQL desde cero, checksums e idempotencia.
- Persistencia, foreign keys y aislamiento multi-tenant base.
- Concurrencia de versiones de valoración, decisiones y descriptivos.
- Anclaje de valoración a versión de descriptivo.
- Evidencia de descriptivo validada contra texto anclado y rechazo de evidencia inventada.
- Workflow DRAFT → IN_REVIEW → RETURNED → IN_REVIEW → APPROVED y bloqueo de edición en revisión/aprobado.
- Better Auth sobre PostgreSQL, creación controlada de usuario, sesión desde cookie y registro público deshabilitado.
- Memberships activas por organización y matriz ADMIN / EVALUATOR / REVIEWER.
- Actor transaccional en SUBMITTED / RETURNED / APPROVED.
- Gold Standard: captura/importación, reproducción determinística, import multi-caso atómico, rollback, aislamiento tenant, dry-run e inmutabilidad SQL de snapshots validados.
- Gold Standard completo —listado, detalle, importación y cobertura— protegido por `MANAGE_GOLD_STANDARD` para evitar revelar referencias HOLDOUT a EVALUATOR/REVIEWER.
- Navegación principal derivada de la membresía activa: Gold Standard solo se renderiza con `MANAGE_GOLD_STANDARD`; los links ya no están hard-coded en el layout y sin contexto de acceso no se muestran destinos de aplicación.
- Comparables internos: solo valoraciones `APPROVED` del tenant activo y de la misma versión metodológica; diferencias de puntos/grado/niveles, ranking determinístico, detección explícita de historial del mismo puesto, aislamiento tenant y contrato que prohíbe consultar Gold Standard/HOLDOUT o inventar similarity/outlier scores.
- Administración de metodologías: parser estructural, DSL permitido, dry-run, duplicados, aislamiento, concurrencia e inmutabilidad de versiones publicadas.
- Selección de metodología ACTIVE al iniciar nuevas valoraciones.
- Excel/CSV: CSV coma/punto y coma/tab, XLSX, agrupación Gold Standard, metodología tabular, rechazo de fórmulas y pruebas de plantillas.
- Round-trip PostgreSQL metodología spreadsheet → Gold Standard spreadsheet.
- Contratos UI/server de imports: permisos ADMIN, dry-run repetido antes de escribir e invalidación al cambiar archivo/origen.
- Calibración: snapshot de membresía, DRAFT → COMPLETED, bloqueo de cierre incompleto, aislamiento tenant, inmutabilidad y rechazo de AI/EXTERNAL aún no integrados.
- Métricas de calibración: acuerdo exacto/±1 por dimensión y grado, distancias, diferencias de puntos y agregación ponderada sin umbral PASS/FAIL inventado.
- HOLDOUT: UI de corrida oculta decisiones expertas, puntos, grado, métricas y resumen mientras DRAFT.
- Candidatos de calibración Excel/CSV: plantilla dinámica sin referencias expertas, parser, dry-run, reemplazos DRAFT, rollback atómico, auditoría transaccional, aislamiento y bloqueo tras COMPLETED.
- HOLDOUT en carga masiva: preview sin puntos/grado/métricas y ausencia de resumen live después del write.
- Cobertura Gold Standard: agregación por metodología/versión, VALIDATED/DRAFT/ARCHIVED, particiones, grados, familias, anclas, descriptivos, evidencia, decisiones obligatorias, justificaciones y aislamiento tenant, sin readiness score.

## Pendiente: E2E real de navegador

### Autenticación y permisos

- Ejecutar `npm run bootstrap:admin` sobre base limpia y confirmar login del primer ADMIN.
- Probar login correcto/incorrecto y redirección a `/sign-in` sin sesión.
- Confirmar logout y rechazo de sesión cerrada.
- Probar expiración/renovación de sesión en staging.
- Crear ADMIN, EVALUATOR y REVIEWER reales y recorrer la matriz visual de permisos.
- Confirmar visualmente que ADMIN ve Puestos / Comparar / Metodologías / Gold Standard / Calibración; EVALUATOR y REVIEWER ven Puestos / Comparar / Metodologías / Calibración pero no Gold Standard.
- Confirmar que `/sign-in` y una request sin membership no muestran links de aplicación en la barra superior.
- Intentar Server Actions manualmente con rol sin permiso y confirmar rechazo backend aunque se manipule HTML.
- Probar usuario con memberships en dos organizaciones y aislamiento al cambiar organización activa; confirmar además que la navegación se refresca con el rol de la nueva organización.
- Probar cookie de organización inexistente/no autorizada.
- Desactivar membership y organización y confirmar pérdida inmediata de acceso y desaparición de links de aplicación.
- Confirmar actor correcto en historial de envío, devolución y aprobación.
- Confirmar que EVALUATOR y REVIEWER reciben `FORBIDDEN` al abrir `/gold-standard`, `/gold-standard/<caseId>` y `/gold-standard/coverage`, sin puntos, grados, decisiones ni metadatos del dataset experto en la respuesta, incluso si escriben la URL manualmente.

### Flujo funcional de valoración

- Crear puesto desde `/jobs/new`.
- Crear descriptivo v1; crear v2 partiendo de v1; iniciar valoración anclada a v2; crear v3 y confirmar que la valoración sigue mostrando v2.
- Seleccionar una metodología ACTIVE distinta del fixture demo y confirmar la versión exacta.
- Seleccionar/modificar niveles en todas las dimensiones.
- Confirmar que no aparece puntaje mientras falten decisiones obligatorias.
- Completar decisiones y validar puntos/grado contra cálculo esperado.
- Registrar justificaciones y añadir/eliminar evidencia desde descriptivo, entrevista y otra fuente.
- Confirmar bloqueo de envío si falta una justificación requerida.
- Enviar como EVALUATOR; confirmar bloqueo de edición en IN_REVIEW.
- Devolver como REVIEWER con comentario obligatorio; editar RETURNED y reenviar.
- Aprobar y confirmar inmutabilidad final.
- Revisar historial y legibilidad de traza.
- Probar layout móvil/desktop.

### Comparables internos

- Abrir `/comparables` como ADMIN, EVALUATOR y REVIEWER y confirmar acceso de solo lectura mediante `VIEW`.
- Seleccionar una valoración APPROVED y cotejar manualmente puntos, grado, familia, departamento y versión metodológica contra la valoración fuente.
- Crear varios puestos APPROVED con la misma metodología y verificar el orden visible: menor `|Δ grado|`, luego menor `|Δ puntos|`, luego menor suma de saltos de nivel.
- Abrir el detalle de diferencias y cotejar niveles base/comparable y distancia ordinal contra la definición metodológica real.
- Confirmar que una valoración DRAFT, IN_REVIEW, RETURNED, CANCELLED o SUPERSEDED no aparece como base ni comparable.
- Confirmar que una valoración de otra versión metodológica no aparece entre candidatos aunque comparta código/nombre de metodología.
- Aprobar dos versiones del mismo puesto y confirmar la etiqueta de historial del mismo puesto.
- Probar puestos con familia/departamento iguales y distintos y confirmar que esas coincidencias son contexto, no cambian silenciosamente el ranking.
- Cambiar de organización y confirmar que ninguna valoración del tenant anterior aparece como base, candidato o detalle.
- Manipular `valuationId` con un UUID de otro tenant o no APPROVED y confirmar “base no disponible” sin revelar datos.
- Confirmar que la pantalla no muestra ni permite inferir Gold Standard, CALIBRATION o HOLDOUT y que no añade una ruta alternativa al dataset experto.
- Confirmar que ningún copy presenta el ranking como equivalencia, PASS/FAIL, similarity score, outlier automático o recomendación de grado.
- Revisar 20+ comparables, detalles largos y tablas en desktop y móvil.

### Administración de metodologías

- Entrar a `/methodologies` y `/methodologies/import` como ADMIN.
- Confirmar rechazo backend/visual de operaciones administrativas para EVALUATOR/REVIEWER.
- Importar metodología propia/autorizada válida desde JSON y usarla en valoración.
- Probar código+versión duplicado sin segunda fila.
- Crear nueva versión del mismo código y confirmar convivencia histórica.
- Retirar ACTIVE y confirmar que desaparece para nuevas valoraciones pero sigue en históricos.
- Confirmar que RETIRED no puede reactivarse/editarse por vías administrativas o directas.
- Revisar copy de derechos/licencia con material no propietario.

### Gold Standard e importación histórica JSON

- Entrar a `/gold-standard/import` como ADMIN y revisar metodologías/IDs/dimensiones/niveles.
- Confirmar rechazo de `/gold-standard`, detalle, coverage e import para EVALUATOR/REVIEWER.
- Pegar JSON malformado y confirmar mensaje seguro sin escrituras.
- Preview de lote válido y cotejo de puntos/grado.
- Editar JSON tras preview y confirmar que Importar vuelve a deshabilitarse.
- Usar `methodologyVersionId` de otro tenant y confirmar “no disponible” sin filtración.
- Importar lote anonimizado y confirmar aparición/partición.
- Probar `caseCode` duplicado y lote con segundo caso inválido: rollback total.
- Confirmar `GOLD_STANDARD_HISTORICAL_IMPORT` en `security_audit_events`.
- Si falla auditoría, revisar logs antes de aceptar entorno.
- Revisar preview/códigos en móvil/desktop.

### Dashboard de cobertura Gold Standard

- Abrir `/gold-standard/coverage` como ADMIN y confirmar modo lectura.
- Abrirlo como EVALUATOR y REVIEWER y confirmar rechazo backend; esta restricción preserva el cegamiento HOLDOUT.
- Con dataset real de varias metodologías/versiones, cotejar VALIDATED/DRAFT/ARCHIVED y CALIBRATION/HOLDOUT/UNASSIGNED contra Gold Standard y DB.
- Confirmar que DRAFT/ARCHIVED no entran en grados, anclas, familias ni métricas de evidencia/justificación.
- Crear metodología con referencias registradas pero ninguna VALIDATED y confirmar solo `NO_VALIDATED_CASES`.
- Dejar grados definidos sin casos y confirmar `UNCOVERED_GRADES` exactos.
- Probar casos sin familia, descriptivo, evidencia o justificación y cotejar conteos.
- Confirmar separación estricta entre versiones de metodología aunque compartan código base.
- Cambiar de organización y confirmar que no aparece ningún conteo/familia/grado/origen del otro tenant.
- Revisar tablas con 10+ grados, muchas familias y nombres largos en desktop/móvil.
- Confirmar que ningún copy convierte huecos en PASS/FAIL, readiness score o veredicto automático.

### Excel / CSV — Gold Standard

- Descargar `/api/templates/gold-standard.xlsx` y abrir en Microsoft Excel desktop y LibreOffice Calc.
- Confirmar hojas, encabezados e instrucciones.
- Abrir CSV con configuración regional Perú y confirmar UTF-8/acentos.
- Guardar CSV separado por `;` y confirmar autodetección.
- Completar 2–5 casos anonimizados en XLSX y cotejar decisiones/evidencias/puntos/grado del preview.
- Repetir dimensión con múltiples evidencias y confirmar agrupación.
- Cambiar archivo tras preview y confirmar bloqueo hasta nuevo dry-run.
- Probar fórmula XLSX y mensaje de rechazo.
- Probar encabezado faltante, booleano/número inválido y metadatos contradictorios.
- Importar lote válido y confirmar `GOLD_STANDARD_SPREADSHEET_IMPORT`.
- Confirmar rollback total si un caso del lote es inválido.
- Probar tabla de errores/descriptivos largos en móvil/desktop.

### Excel / CSV — metodologías

- Descargar `/api/templates/methodology.xlsx` y abrir en Excel/LibreOffice.
- Confirmar que `Methodology` es importable y `Ejemplo` no se procesa.
- Completar metodología ficticia pequeña y verificar factores/dimensiones/niveles/pasos/grados.
- Repetir CSV por coma y punto y coma.
- Cambiar archivo u origen tras preview y confirmar nuevo dry-run obligatorio.
- Desmarcar confirmación de derechos y confirmar bloqueo backend.
- Probar STEP inválido, referencias inexistentes, lookup duplicado y grados superpuestos.
- Importar versión válida, verla en catálogo y usarla en una valoración.
- Confirmar `METHODOLOGY_SPREADSHEET_IMPORTED`.
- Revisar mensajes/tablas móvil/desktop.

### Corridas de calibración

- Como ADMIN, asignar referencias VALIDATED de misma metodología a CALIBRATION y crear corrida.
- Cotejar membresía congelada y confirmar que cambios posteriores de partición no alteran corrida histórica.
- En CALIBRATION, confirmar que referencia experta no aparece antes del primer guardado y sí el feedback después.
- Guardar candidato exacto y uno con diferencia; cotejar distancias, puntos, grado y resumen.
- Refrescar a mitad de corrida y confirmar persistencia.
- Intentar completar con pendientes: bloqueo UI/backend.
- Completar todos, cerrar y confirmar solo lectura/inmutabilidad.
- Invocar manualmente acción sobre COMPLETED y confirmar rechazo.
- Como EVALUATOR/REVIEWER, abrir corrida en lectura e intentar create/save/complete: `FORBIDDEN`.
- Crear HOLDOUT, guardar candidatos y confirmar que mientras DRAFT no aparecen decisiones/puntos/grado/métricas/resumen de referencia.
- Confirmar que tampoco pueden obtenerlos navegando directamente al Gold Standard.
- Completar último caso HOLDOUT y confirmar revelado recién al cierre.
- Revisar “Mayores desviaciones” y orden, sin etiqueta automática de outlier.
- Confirmar `CALIBRATION_RUN_CREATED` y `CALIBRATION_RUN_COMPLETED` con actor/organización.
- Probar navegación, selects, detalles y tablas en desktop/móvil; nombres/descriptivos largos.
- Crear referencias de dos metodologías y confirmar que una corrida nunca mezcla versiones.
- Confirmar que AI/EXTERNAL no se ofrecen como fuente funcional.

### Excel / CSV — candidatos de calibración

- Como ADMIN, abrir corrida DRAFT y `/calibration/<runId>/import`.
- Descargar plantilla XLSX y probar Excel/LibreOffice; confirmar freeze, textos y códigos.
- Descargar CSV y confirmar UTF-8/Perú.
- Inspeccionar plantilla HOLDOUT y confirmar ausencia de selecciones/puntos/grados/métricas expertas.
- Completar 2–5 casos y hacer preview; en CALIBRATION cotejar feedback.
- En HOLDOUT, confirmar preview sin puntos/grado/referencia/métricas y resumen aún oculto tras write.
- Para lote parcial, eliminar filas de casos no incluidos; guardar incluidos y dejar otros pendientes.
- Dejar un caso incluido incompleto y confirmar rechazo sin score provisional.
- Cambiar archivo tras preview y confirmar bloqueo hasta repetir dry-run.
- Repetir caso ya evaluado, comprobar `OVERWRITE` y reemplazo solo en DRAFT.
- Añadir segundo caso con nivel inválido y confirmar rollback total.
- Alterar `codigo_caso` por otro run y `runId` por otro tenant: rechazo sin filtración.
- Probar fórmula en `codigo_nivel`.
- Completar corrida y confirmar import bloqueado y write manual rechazado.
- Confirmar `CALIBRATION_CANDIDATE_BATCH_IMPORTED` con actor/run/archivo/cantidad/reemplazos/códigos.
- Probar preview con 20–30 casos en desktop/móvil.

## Pendiente: seguridad/robustez de uploads antes de exposición pública

- Pruebas adversariales de XLSX comprimido/zip bomb y límite de ratio/tamaño descomprimido.
- Evaluar AV/antimalware si se persisten archivos originales; hoy se procesan en memoria.
- Rate limiting/cuota por usuario y organización en uploads.
- Medir memoria/CPU con archivos cercanos a 5 MiB y 5.000 filas en VPS objetivo.
- Prueba concurrente de múltiples uploads grandes.
- Confirmar que objetos/links externos/macros XLSX no causan accesos externos ni contenido inesperado; `.xlsm` debe seguir rechazado.
- Revisar retención/logs para evitar volcado de contenido sensible de celdas.

## Pendiente antes de exposición pública

- Manejo consistente de errores de Server Actions con mensajes de usuario.
- Accesibilidad, lector de pantalla y navegación por teclado.
- E2E automatizado de navegador (Playwright o equivalente).
- Recovery de contraseña y correo transaccional.
- Evaluar MFA/SSO según cliente.
- Rate limiting distribuido si hay múltiples instancias.
- Backup/restore PostgreSQL y prueba real de restauración.
- Rotación segura de `BETTER_AUTH_SECRET` y credenciales DB.
- HTTPS, cookies secure, CSP/headers y reverse proxy en staging.
- Staging aislado y ejecución de checklist antes de producción.
- Separar migraciones/bootstrap demo de permisos DDL de runtime antes de SaaS multi-tenant externo.
