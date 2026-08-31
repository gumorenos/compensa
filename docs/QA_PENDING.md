# Compensa — QA pendiente

Actualizado: 2026-08-30

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
- Comparación lado a lado 2–5: IDs únicos, solo `APPROVED`, tenant activo, misma versión metodológica, orden de columnas estable, resumen de puntos/grados, matriz por dimensión con estados `SAME_LEVEL` / `ALL_MISSING` / `DIFFERENT`, rechazo de DRAFT/cross-tenant/mismatch y contrato sin Gold Standard/HOLDOUT ni score/veredicto automático.
- Bandeja operativa de Valoraciones: listado tenant-safe de todas las versiones, conteos por estado, filtros parametrizados por puesto/estado/estructura/grado/metodología/iniciador/fecha, validación previa de UUID/estado/fecha, actor de inicio opcional derivado de auditoría, fechas UTC explícitas, límite declarado de 200 filas y contrato sin Gold Standard/HOLDOUT.
- Inicio operativo: métricas tenant-safe de puestos activos, estados de valoración, puestos activos sin valoración APPROVED y valoraciones editables incompletas; actividad reciente limitada a 8 versiones, semántica explícita para puestos inactivos, fechas UTC y contrato sin Gold Standard/HOLDOUT/calibración/IA.
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
- Fundación de asistencia IA: contrato provider-neutral sin scoring/grados, validación estricta de campos/dimensiones/niveles/confianza, evidencia anclada al descriptivo fijado, aislamiento tenant, fingerprint de inputs, descarte de resultados obsoletos y persistencia atómica de run/sugerencias/evidencia/preguntas/auditoría sin modificar decisiones, puntos, grado o workflow.
- Resolución humana de sugerencias IA: contrato estricto ACCEPTED/MODIFIED/REJECTED, UUID adversarial seguro, aislamiento tenant, bloqueo por estado/staleness, reutilización atómica del motor determinístico, abstención, concurrencia, actor/auditoría, rollback, semántica e inmutabilidad PostgreSQL sin sobrescribir la sugerencia original.
- Gobernanza IA por tenant: default-off sin fila, opt-in independiente de procesamiento externo, revocación consistente, permiso ADMIN dedicado `MANAGE_AI_ASSISTANCE`, aislamiento PostgreSQL, constraint de consentimiento y actualización+auditoría atómicas sin invocar proveedor, scoring ni rutas Gold Standard/HOLDOUT/calibración.
- Workflow local de asistencia IA: binding fixture default-off, provider determinístico in-process sin red ni confianza inventada, tenant gate, procesamiento LOCAL sin consentimiento externo, provider-unavailable seguro, generación sin mutar decisiones/puntos/grado/estado, historial tenant-scoped tras revocación, resolución por la frontera humana existente y protección contra UUID/cross-tenant/cross-valuation tampering sin consultar scoring, Gold Standard, HOLDOUT o calibración desde la superficie de asistencia.
- E2E de navegador del workflow local IA en Chrome headless contra la imagen Docker hardened: login real ADMIN/EVALUATOR/REVIEWER, opt-in del tenant manteniendo procesamiento externo apagado, guard de valoración sin descriptivo, generación `LOCAL_FIXTURE`, aceptación explícita con justificación humana, REVIEWER en solo lectura, actor/source/auditoría PostgreSQL y ausencia de requests HTTP(S) del target web fuera del origen local de Compensa.

## Pendiente antes de conectar un proveedor IA real

- Elegir proveedor/modelo tras revisar política de retención, entrenamiento, privacidad, residencia regional y tratamiento de datos empresariales.
- Definir secrets management para API keys sin almacenarlas en DB, repositorio, logs ni payloads de auditoría.
- Definir prompt versionado y trazabilidad de versión exacta de modelo/proveedor para reproducibilidad.
- Implementar límites de costo/cuota, rate limiting, timeout, retry/backoff e idempotencia para invocaciones reales.
- Revisar logging/redacción para impedir que descriptivos, evidencia o respuestas completas terminen en logs operativos.
- Probar prompt injection y contenido adversarial dentro de descriptivos; las instrucciones del documento no deben alterar el contrato del sistema.
- Confirmar por contrato y E2E que Gold Standard, HOLDOUT y respuestas expertas nunca se envían al proveedor durante valoración normal.
- Validar que errores/timeouts del proveedor no escriben decisiones ni resultados parciales y dejan el flujo manual disponible.
- Definir UX de consentimiento/aviso cuando el contenido del puesto vaya a salir de la infraestructura del cliente.
- Ejecutar revisión de seguridad y privacidad específica del proveedor antes de habilitar tráfico real.
- Antes del primer proveedor externo, recorrer en navegador el flujo completo con el provider fixture/local determinístico en `/valuations/<valuationId>/ai-assistance`: generar → revisar → aceptar/modificar/rechazar → recalcular cuando corresponda.
- Confirmar en la UI operativa que ADMIN/EVALUATOR pueden generar y resolver mediante `EVALUATE`, REVIEWER recibe rechazo backend si intenta mutar y manipular HTML/Server Action no evita el permiso.
- Probar sugerencia con abstención: no debe poder aceptarse; modificar exige nivel humano explícito y rechazar no debe tocar decisión/puntos/grado.
- Abrir la misma sugerencia en dos pestañas/usuarios y confirmar una única resolución visible, error seguro al segundo intento y actor correcto en historial/auditoría.
- Cambiar de tenant durante el flujo IA y confirmar que run, sugerencias, resolución, descriptivo y valoración del tenant anterior no se muestran ni pueden mutarse.

## Pendiente: E2E real de navegador

### Autenticación y permisos

- Ejecutar `npm run bootstrap:admin` sobre base limpia y confirmar login del primer ADMIN.
- Probar login correcto/incorrecto y redirección a `/sign-in` sin sesión.
- Confirmar logout y rechazo de sesión cerrada.
- Probar expiración/renovación de sesión en staging.
- Crear ADMIN, EVALUATOR y REVIEWER reales y recorrer la matriz visual de permisos más allá del smoke automatizado de asistencia IA.
- Confirmar visualmente que ADMIN ve Inicio / Puestos / Valoraciones / Comparar / Metodologías / Gold Standard / Calibración / IA; EVALUATOR y REVIEWER ven Inicio / Puestos / Valoraciones / Comparar / Metodologías / Calibración pero no Gold Standard ni IA.
- Confirmar que `/sign-in` y una request sin membership no muestran links de aplicación en la barra superior.
- Intentar Server Actions manualmente con rol sin permiso y confirmar rechazo backend aunque se manipule HTML.
- Probar usuario con memberships en dos organizaciones y aislamiento al cambiar organización activa; confirmar además que la navegación se refresca con el rol de la nueva organización.
- Probar cookie de organización inexistente/no autorizada.
- Desactivar membership y organización y confirmar pérdida inmediata de acceso y desaparición de links de aplicación.
- Confirmar actor correcto en historial de envío, devolución y aprobación.
- Confirmar que EVALUATOR y REVIEWER reciben `FORBIDDEN` al abrir `/gold-standard`, `/gold-standard/<caseId>` y `/gold-standard/coverage`, sin puntos, grados, decisiones ni metadatos del dataset experto en la respuesta, incluso si escriben la URL manualmente.

### Gobernanza de asistencia IA

- Abrir `/ai-assistance` como EVALUATOR y REVIEWER escribiendo la URL directamente y confirmar `FORBIDDEN`; no basta con ocultar el link.
- En staging, refrescar después de habilitar solo asistencia IA y confirmar persistencia sin habilitar procesamiento externo.
- Habilitar procesamiento externo con asistencia habilitada y confirmar ambos flags en el tenant correcto.
- Deshabilitar asistencia después de haber autorizado procesamiento externo y confirmar que ambos flags quedan en `false`.
- Cambiar de organización activa y confirmar que los flags de un tenant no aparecen ni afectan al otro.
- Confirmar que `AI_ASSISTANCE_SETTINGS_UPDATED` registra organización y actor correctos para habilitación, consentimiento y revocación.
- Manipular el formulario para intentar `externalProcessingAllowed=true` con asistencia deshabilitada y confirmar que no queda un estado contradictorio.
- En staging, inspeccionar logs/proceso además del target web para confirmar que alternar la configuración no invoca proveedor/modelo, no envía descriptivos/evidencia y no requiere API keys.
- Confirmar que el modo manual de Puestos/Valoraciones funciona igual con asistencia deshabilitada.
- Revisar `/ai-assistance` en desktop/móvil y verificar legibilidad del aviso de procesamiento externo y de los controles.

### Workflow local de asistencia IA

- Con `COMPENSA_AI_FIXTURE_ENABLED=false` y asistencia habilitada para el tenant, abrir `/valuations/<valuationId>/ai-assistance`: debe indicar proveedor no disponible; históricos siguen visibles y no debe poder generarse una nueva corrida.
- Activar `COMPENSA_AI_FIXTURE_ENABLED=true` en staging y reiniciar la app; confirmar que la configuración real del entorno expone el aviso `Modo de prueba local` sin presentar el fixture como recomendación real.
- En staging, inspeccionar logs/proceso y red del host durante una corrida para complementar la aserción CDP del CI: cero tráfico a proveedor/modelo externo y ausencia total de API keys requeridas.
- Con asistencia del tenant deshabilitada, confirmar que la valoración manual sigue funcionando y que generación/resolución IA están bloqueadas tanto visualmente como en backend.
- Como ADMIN/EVALUATOR, repetir una mutación en staging; como REVIEWER, intentar manualmente la Server Action manipulada y confirmar `FORBIDDEN` backend aunque el smoke automatizado ya valide la UI de solo lectura.
- Antes/después de generar una corrida de staging, cotejar decisiones, `total_points`, `grade_code` y estado para confirmar en el entorno desplegado que generación no modifica ninguno.
- Repetir una aceptación con un caso representativo de staging y cotejar nivel, source `AI_ACCEPTED`, resolución inmutable y recálculo solo a través del motor determinístico cuando corresponda.
- Para sugerencia concreta, modificar y confirmar nivel humano explícitamente diferente, source `AI_MODIFIED` y recálculo determinístico cuando corresponda.
- Rechazar sugerencia y confirmar que no crea/modifica decisión, puntos ni grado.
- Probar abstención: no debe existir acción de aceptar; modificar exige nivel humano explícito; rechazar no debe tocar decisión/puntos/grado.
- Confirmar que el campo de justificación humana inicia vacío y que el rationale del fixture nunca se copia automáticamente.
- Refrescar después de generar/resolver y confirmar persistencia de la última corrida, evidencia, preguntas y resolución; los registros históricos anteriores deben seguir en DB e inmutables aunque esta primera UI muestre solo la corrida más reciente.
- Generar una segunda corrida y confirmar que la UI muestra la más reciente sin borrar ni reescribir la anterior.
- Deshabilitar asistencia del tenant después de generar: histórico debe permanecer visible, mientras nuevas corridas y resoluciones pendientes quedan bloqueadas también en backend.
- Cambiar de tenant durante el flujo y confirmar que corrida, sugerencias, evidencia, preguntas y resoluciones del tenant anterior no aparecen ni pueden mutarse.
- Manipular `valuationId` y `suggestionId` con UUID malformado, otro tenant y una sugerencia de otra valoración del mismo tenant; confirmar rechazo seguro sin mutar ninguna valoración relacionada.
- Abrir la misma sugerencia en dos pestañas/usuarios y resolver simultáneamente; solo una resolución debe persistir y el segundo intento debe fallar de forma segura mostrando el estado correcto tras refresh.
- Cambiar la valoración a IN_REVIEW o APPROVED y confirmar que la ruta conserva lectura histórica pero deshabilita generación/resolución.
- Cotejar `AI_ASSISTANCE_RECORDED` y los cambios de gobernanza en auditoría; el CI ya verifica actor/redacción de `AI_SUGGESTION_RESOLVED`, pero todavía debe confirmarse el resto del historial en staging.
- Confirmar visualmente que Gold Standard, HOLDOUT y calibración no se muestran ni se filtran a través de la ruta de asistencia.
- Revisar navegación Valoración ↔ Asistencia IA, rationale/evidencia largos, selects y formularios en desktop/tablet/móvil.

### Inicio operativo

- Abrir `/overview` como ADMIN, EVALUATOR y REVIEWER y confirmar acceso de solo lectura mediante `VIEW`.
- Cotejar `Puestos activos` contra la DB y confirmar que puestos INACTIVE no se incluyen.
- Cotejar DRAFT / IN_REVIEW / RETURNED / APPROVED contra la bandeja y la DB.
- Confirmar que `Sin valoración aprobada` cuenta puestos activos sin ninguna versión en estado APPROVED; no debe contar valoraciones ni incluir puestos inactivos.
- Confirmar que `Valoraciones incompletas` cuenta únicamente DRAFT/RETURNED con `total_points IS NULL`; una valoración completa en RETURNED no debe contarse como incompleta.
- Crear un puesto activo sin ninguna valoración y confirmar que aumenta `Sin valoración aprobada` pero no `Valoraciones incompletas`.
- Crear un puesto con valoración DRAFT incompleta y confirmar que ambos indicadores cambian de acuerdo con su semántica independiente.
- Aprobar una valoración y confirmar que el puesto deja de contar como `Sin valoración aprobada`.
- Inactivar un puesto con histórico y confirmar que desaparece de los KPI de puestos activos, pero su histórico no se elimina.
- Cambiar de organización activa y confirmar aislamiento total de métricas y actividad reciente.
- Crear más de 8 valoraciones con `updated_at` distintos y confirmar que la tabla muestra exactamente las 8 más recientes en orden descendente.
- Confirmar que la tabla se presenta como `Valoraciones actualizadas recientemente` y no como historial/auditoría; cotejar un caso donde `updated_at` no represente el orden de eventos de auditoría.
- Confirmar visualmente que las fechas se muestran en UTC mientras no exista timezone por organización.
- Abrir los enlaces de tarjetas y confirmar destino correcto a Puestos o a la bandeja con el filtro de estado esperado.
- Abrir cada fila reciente y confirmar que lleva al `valuationId` histórico exacto.
- Confirmar que el dashboard no muestra readiness score, madurez automática, PASS/FAIL, outlier ni recomendación de grado.
- Confirmar que la pantalla no consulta ni permite inferir Gold Standard, CALIBRATION o HOLDOUT.
- Revisar tarjetas y tabla con nombres/metodologías largos en desktop/tablet/móvil y confirmar legibilidad/scroll.

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

### Bandeja de Valoraciones

- Abrir `/valuations` como ADMIN, EVALUATOR y REVIEWER y confirmar acceso de solo lectura mediante `VIEW`.
- Crear varias versiones del mismo puesto y confirmar que cada versión aparece como fila independiente; la bandeja no debe colapsarlas en “última valoración”.
- Cotejar los contadores DRAFT / IN_REVIEW / RETURNED / APPROVED / SUPERSEDED / CANCELLED contra la DB y confirmar que siguen mostrando el total del tenant aunque se apliquen filtros.
- Probar individualmente y en combinación búsqueda por nombre/código, estado, área, familia, grado, versión metodológica, iniciador y rango de fechas.
- Manipular `status`, `methodologyVersionId`, `actorUserId`, `dateFrom` y `dateTo` con valores malformados; confirmar advertencia segura, filtros descartados y ausencia de error SQL/500.
- Usar rango `dateFrom > dateTo` y confirmar el mismo rechazo seguro.
- Confirmar que la búsqueda parcial por nombre/código no devuelve filas de otra organización.
- Cambiar de organización y confirmar aislamiento de filas, contadores, áreas, familias, grados, metodologías y lista de iniciadores.
- Abrir un histórico creado sin `VALUATION_STARTED` auditado y confirmar `Iniciada por = —`; no debe inferirse actor desde otro evento.
- Crear una valoración por el flujo web y cotejar que el actor mostrado corresponde al primer `VALUATION_STARTED` de esa valoración.
- Probar exactamente los bordes UTC del filtro de actualización (00:00:00 y 23:59:59) y confirmar la convención mostrada en UI.
- Generar más de 200 coincidencias y confirmar total real + aviso `Mostrando primeras 200`, sin página HTML ilimitada.
- Abrir varias filas y confirmar que cada botón `Abrir` lleva al `valuationId` histórico exacto.
- Confirmar que la cola no permite cambiar estado, puntaje, grado, metodología ni actor directamente.
- Revisar filtros y tabla con nombres/metodologías largos en desktop/tablet/móvil y confirmar scroll/legibilidad.
- Confirmar que la pantalla no consulta ni revela Gold Standard, CALIBRATION o HOLDOUT.

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

### Comparación lado a lado 2–5

- Abrir `/comparables/compare` como ADMIN, EVALUATOR y REVIEWER y confirmar acceso de solo lectura mediante `VIEW`.
- Seleccionar exactamente 2, 3, 4 y 5 valoraciones APPROVED de la misma versión metodológica y confirmar que el orden visible de columnas coincide con el orden elegido.
- Intentar 0, 1 y más de 5 selecciones y confirmar mensaje seguro sin comparación parcial.
- Repetir el mismo `valuationId` varias veces en la URL y confirmar que no cuenta como varias valoraciones.
- Manipular la URL con una valoración DRAFT/no aprobada o de otro tenant y confirmar “no disponible” sin revelar nombre, puntos, grado ni metadata ajena.
- Mezclar dos versiones metodológicas del mismo tenant y confirmar rechazo explícito por incompatibilidad, sin normalización de escalas.
- Cotejar puntos mínimo/máximo, spread observado y grados contra las valoraciones fuente.
- Cotejar cada fila factor/dimensión con los niveles guardados en las 2–5 valoraciones.
- Confirmar visualmente los tres estados de fila: `Mismo nivel`, `Sin decisión en todos` y `Diferente`; una ausencia compartida no debe presentarse como equivalencia.
- Abrir cada enlace “Abrir valoración” y confirmar que apunta al histórico exacto usado en la comparación.
- Confirmar que familia/departamento/área son contexto descriptivo y no producen score, ranking ni veredicto.
- Confirmar que la pantalla no muestra ni permite inferir Gold Standard, CALIBRATION o HOLDOUT.
- Revisar una metodología con muchas dimensiones y cinco columnas en desktop/tablet/móvil; verificar scroll horizontal, textos largos, códigos y legibilidad.
- Confirmar que ningún copy presenta diferencias como error, equivalencia, PASS/FAIL, outlier o recomendación automática de grado.

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
- Ampliar E2E automatizado de navegador más allá del smoke crítico de asistencia IA: autenticación general, puestos, valoración manual/revisión, imports, comparables y calibración.
- Recovery de contraseña y correo transaccional.
- Evaluar MFA/SSO según cliente.
- Rate limiting distribuido si hay múltiples instancias.
- Backup/restore PostgreSQL y prueba real de restauración.
- Rotación segura de `BETTER_AUTH_SECRET` y credenciales DB.
- HTTPS, cookies secure, CSP/headers y reverse proxy en staging.
- Staging aislado y ejecución de checklist antes de producción.
- Separar migraciones/bootstrap demo de permisos DDL de runtime antes de SaaS multi-tenant externo.
