# Importaciones Excel / CSV

Compensa admite `.xlsx` y `.csv` como capa de entrada cómoda para dos contratos que ya existían en JSON:

1. **Gold Standard histórico** — convierte filas planas en casos expertos y luego usa el mismo dry-run/importador atómico del contrato JSON v1.
2. **Metodologías** — convierte filas `META / FACTOR / DIMENSION / LEVEL / STEP / LOOKUP / GRADE` al mismo DSL determinístico usado por la importación JSON.

La hoja de cálculo **no tiene un motor de scoring alternativo**. Todo archivo se normaliza a un payload canónico y vuelve a pasar por los validadores y servicios existentes antes de cualquier escritura.

## Plantillas descargables

Con sesión ADMIN y permisos correspondientes:

- `/api/templates/gold-standard.xlsx`
- `/api/templates/gold-standard.csv`
- `/api/templates/methodology.xlsx`
- `/api/templates/methodology.csv`

Las plantillas XLSX incluyen `Instrucciones`, la hoja vacía que sí se importa (`GoldStandard` o `Methodology`) y una hoja `Ejemplo` que **no se importa**.

## Gold Standard

La hoja `GoldStandard` utiliza una fila por decisión y, opcionalmente, por evidencia. `codigo_caso` agrupa todas las filas del mismo puesto.

Columnas:

```text
codigo_caso
etiqueta_anonima
id_metodologia
particion
es_ancla
codigo_puesto
puesto
departamento
area
familia_puesto
descriptivo
codigo_dimension
codigo_nivel
justificacion
tipo_evidencia
seccion_evidencia
evidencia
puntos_esperados
grado_esperado
notas
```

En la primera fila de cada caso son obligatorios `codigo_caso`, `etiqueta_anonima`, `id_metodologia`, `puesto`, `codigo_dimension` y `codigo_nivel`. En filas posteriores del mismo caso pueden omitirse los metadatos repetidos, pero `codigo_caso`, `codigo_dimension` y `codigo_nivel` siguen siendo obligatorios.

Una dimensión puede repetirse únicamente para añadir más evidencias; si una repetición cambia el nivel seleccionado o contradice los metadatos ya fijados del caso, el archivo se rechaza.

`tipo_evidencia` acepta `JOB_DESCRIPTION`, `INTERVIEW` u `OTHER`, además de sus equivalentes españoles definidos por el parser. `puntos_esperados` y `grado_esperado` son opcionales, pero si aparece uno deben aparecer ambos y deben coincidir con el recálculo determinístico.

## Metodologías

La hoja `Methodology` usa los siguientes tipos de registro:

- `META`: exactamente una fila con código, nombre, versión y `paso_total`.
- `FACTOR`: factor principal.
- `DIMENSION`: usa `codigo_padre` para indicar su factor.
- `LEVEL`: usa `codigo_padre` para indicar su dimensión.
- `STEP`: paso del DSL restringido.
- `LOOKUP`: una entrada de tabla para un STEP `lookup`; `codigo_padre` identifica ese STEP.
- `GRADE`: rango de puntos de un grado.

Columnas:

```text
tipo_registro
codigo
nombre
version
codigo_padre
descripcion
requerido
etiqueta
tipo_paso
referencias
numerador
denominador
valor_redondeo
precision
clave_lookup
valor_lookup
min_puntos
max_puntos
paso_total
```

Los únicos `tipo_paso` permitidos son `lookup`, `sum`, `multiply`, `divide` y `round`. No se admite JavaScript, expresiones de hoja de cálculo ni código arbitrario.

Referencias:

```text
selection:CODIGO_DIMENSION
step:CODIGO_PASO
constant:100
```

En `referencias`, múltiples valores se separan con `|`, por ejemplo:

```text
step:KNOWLEDGE|step:IMPACT
```

## CSV

Se detectan automáticamente los delimitadores coma, punto y coma y tabulación. Esto permite importar CSV guardados por Excel bajo distintas configuraciones regionales. Las celdas entre comillas admiten comas, delimitadores, saltos de línea y comillas escapadas.

## XLSX

Cuando el libro contiene más de una hoja, debe existir `GoldStandard` o `Methodology` según el flujo. Si existe una sola hoja, puede usarse aunque tenga otro nombre.

Las fórmulas están deliberadamente prohibidas. Compensa solo acepta valores materializados para evitar interpretación de expresiones, resultados cacheados ambiguos o comportamiento dependiente de Excel.

## Límites de esta versión

- 5 MiB por archivo.
- 5.000 filas de datos.
- 64 columnas.
- 100.000 caracteres por celda.
- máximo 100 casos Gold Standard por operación.
- payload canónico limitado adicionalmente antes de llegar a los servicios de escritura.

## Seguridad y datos

- Las rutas de plantillas y las Server Actions exigen los mismos permisos ADMIN que las importaciones JSON.
- La previsualización no escribe datos.
- La importación vuelve a ejecutar el dry-run en servidor antes de escribir.
- Gold Standard sigue usando importación transaccional/atómica.
- Metodologías siguen requiriendo propietario/fuente y confirmación explícita de derechos de uso.
- No cargues nombres de trabajadores, DNI, remuneraciones, desempeño individual ni otros datos personales que no sean necesarios para valorar el puesto.
- Compensa no incorpora, licencia ni certifica contenido propietario de Hay/Korn Ferry u otros terceros.

## QA manual pendiente

El inventario único de QA que todavía requiere navegador, staging o pruebas adversariales está en `docs/QA_PENDING.md`.
