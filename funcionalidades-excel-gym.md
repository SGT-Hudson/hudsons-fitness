# Funcionalidades del archivo `GYM Gonzalo.xlsx`

> Documento de síntesis extraído del Excel actual, pensado como punto de partida para diseñar la futura aplicación web y móvil de Hudson's Fitness.

El libro se organiza en 3 hojas que se conectan entre sí por fórmulas:

1. **Métricas** — diario de mediciones corporales.
2. **Resultados** — panel de control (peso objetivo, contador de comidas del día, recetas y suma de macros).
3. **Ingredientes** — base de datos nutricional usada por las recetas.

---

## 1. Hoja `Metricas` — Diario de composición corporal

Registro **día a día** desde el 21/07/2024 (con la rejilla de fechas preparada hasta enero de 2027). Cada fila representa un día y guarda mediciones tanto de la **báscula de casa** como de la **báscula del gimnasio** (más fiable y menos frecuente).

### Campos por día

| Columna          | Concepto                 | Notas                                                                                                                                                 |
| ---------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dia`            | Fecha del registro       | Una fila por día                                                                                                                                      |
| `Peso`           | Peso en kg               | Báscula de casa                                                                                                                                       |
| `Peso media`     | Media móvil del peso     | Ventana de 5 días (3 al inicio) para suavizar el ruido                                                                                                |
| `Peso ideal`     | Peso objetivo proyectado | Mismo valor para todas las filas: el peso objetivo calculado en la hoja `Resultados` a partir del % de grasa objetivo y la masa libre de grasa actual |
| `Grasa`          | % grasa corporal         |
| `Agua`           | % agua                   |
| `Musculo`        | % músculo                |
| `Grasa Objetivo` | % grasa meta             | Mismo valor para todas las filas: el % de grasa corporal objetivo configurado en la hoja `Resultados` (actualmente 20 %)                              |

### Funcionalidad implícita

- **Suavizado**: media móvil de 5 días para el peso (evita reaccionar a fluctuaciones diarias por agua, glucógeno o sodio).
- **Histórico extenso**: la hoja está dimensionada para varios años de datos.

---

## 2. Hoja `Resultados` — Panel de control diario

Es el corazón "operativo" del archivo. Combina cuatro bloques: estado actual, contador de comidas, objetivos de macros y biblioteca de recetas.

### 2.1 Estado y objetivos corporales

| Celda | Concepto                                    | Lógica                                                                                                                   |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `B1`  | Días transcurridos desde el inicio del plan | `DAYS(TODAY(), "20/07/2024")`                                                                                            |
| `C2`  | Peso de referencia inicial (83,5 kg)        | Se usa como fallback si no hay peso de hoy                                                                               |
| `C3`  | **Peso actual**                             | Toma el peso del día N de la hoja Métricas (columna Peso)                                                                |
| `C6`  | **% grasa actual**                          | Toma el promedio de grasa corporal (el valor "Grasa media" del día N de la hoja Métricas)                                |
| `D6`  | **kg de grasa actual**                      | `Peso × % grasa`                                                                                                         |
| `C7`  | **% grasa objetivo** (0,20 = 20 %)          | Parámetro fijo configurable                                                                                              |
| `D7`  | kg de grasa al peso objetivo                | `Peso objetivo × % objetivo`                                                                                             |
| `G3`  | **Peso libre de grasa**                     | `Peso actual − kg grasa`                                                                                                 |
| `F1`  | **Peso objetivo (kg)**                      | `Peso libre de grasa / (1 − % grasa objetivo)` — el peso al que llegarías manteniendo la masa magra y bajando solo grasa |

> **Idea central**: el peso objetivo no se elige a dedo, sino que se _calcula_ a partir del % de grasa objetivo asumiendo que toda la pérdida sea grasa.

### 2.2 Contador de comidas del día

Un conjunto de números enteros que indican **cuántas raciones de cada plato** se han comido hoy. Cada número corresponde a un plato diferente:

`Cafés` · `Galletas` · `Curry` · `Batido Prote` · `Prote + café` · `Arroz Cubana` · `Pistachos` · `Lays` · `Batata`

Funciona como un **selector rápido** (subes el contador a 1, 2…) y todo el resto se recalcula.

### 2.3 Objetivos y consumo de macronutrientes

| Macro             | Objetivo                                       | Consumido                                         |
| ----------------- | ---------------------------------------------- | ------------------------------------------------- |
| **Calorías**      | Valor fijo (actualmente 2 200 kcal)            | Suma de `kcal/ración × nº raciones` de cada plato |
| **Proteínas**     | `Peso × 1,6 g` (mínimo) y `Peso × 2 g` (ideal) | Suma de `prot/ración × nº raciones`               |
| **Carbohidratos** | `(kcal − prot×4 − grasa×9) / 4` (lo que queda) | Suma agregada                                     |
| **Grasa**         | `25 % de las kcal / 9`                         | Suma agregada                                     |
| **Fibra**         | 25 g fijos                                     | Suma agregada                                     |

Existen también campos para sumar manualmente la **cena** del día (kcal, proteína, carbohidratos, grasa, fibra) sin necesidad de modelarla como receta.

### 2.4 Recetas

Cada receta se define como una mini-tabla:

```
Nombre de la receta       Número de raciones en que se divide
Ingrediente | g en receta | kcal totales | prot totales | carbs totales | grasa totales | fibra total
...
                          Total por ingrediente (suma)
                          Por ración (Total ÷ Raciones)
```

Los totales por ingrediente se calculan multiplicando los gramos por los valores **por gramo** de cada macro (kcal/g, proteína/g, carbs/g, grasa/g, fibra/g) que están en la hoja Ingredientes.

Recetas presentes en el libro:

| Receta                           | Raciones | Detalle                                                                                                                                                            |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Curry de pavo (con arroz aparte) | 5        | Pavo, yogur griego, YoPro, cebolla, tomate frito, jengibre, curry. El arroz basmati (70 g) se suma fuera de la división por raciones, porque se cocina por porción |
| Galletas                         | 25       | Mantequilla, azúcar, harina, huevos                                                                                                                                |
| Café con leche                   | 1        | Café (kcal manuales) + leche semi                                                                                                                                  |
| Batido de proteínas              | 1        | Scoop de proteína + leche                                                                                                                                          |
| Arroz a la cubana                | 1        | Huevos + claras + arroz basmati + tomate frito                                                                                                                     |
| Patatas Lays                     | 1        | Lays (30 g)                                                                                                                                                        |
| Croquetas y patata               | 1        | Croquetas + patatas congeladas                                                                                                                                     |
| Batido Prote + café              | 1        | Scoop "Prote + café" + leche                                                                                                                                       |
| Batata congelada                 | 1        | Batata (70 g)                                                                                                                                                      |
| Pistachos tostados               | 1        | Pistachos (10 g)                                                                                                                                                   |

> **Truco interesante**: el curry hace dos pasos — primero calcula macros por ración del guiso (sin arroz), y después suma el arroz que se sirve cada vez. Eso permite tener un guiso batch-cooked y acompañarlo con la guarnición fresca del día.

---

## 3. Hoja `Ingredientes` — Base de datos nutricional

Tabla con macros por **100 g** (o por unidad cuando aplica) de cada alimento:

| Campo            | Detalle                       |
| ---------------- | ----------------------------- |
| `Nombre`         | Identificador del ingrediente |
| `Calorias/100g`  | kcal                          |
| `Proteinas/100g` | g                             |
| `Carbs/100g`     | g                             |
| `Grasa/100g`     | g                             |
| `Fibra/100g`     | g                             |

Una segunda tabla espejo reexpresa los valores de cada macro **por gramo** (y por unidad para huevos, claras, scoops de proteína), que son los que consumen las fórmulas de las recetas para calcular rápidamente los totales.

Ingredientes actuales: Pavo, Yogur griego, Cebolla, Tomate frito, Jengibre, Curry, Arroz basmati, Mantequilla, Azúcar, Harina, Huevos (u), Lays al punto, Leche semi, Scoop Prote (u), YoPro, Clara huevo (u), Patatas congeladas, Croquetas, Scoop Prote + café, Batata congelada, Pistachos tostados.

---

## 4. Síntesis de funcionalidades del Excel actual

Del archivo se pueden extraer **siete capacidades** que la app debería replicar:

1. **Registro diario de composición corporal** con doble fuente (casa vs. gimnasio) y suavizado por media móvil.
2. **Cálculo automático del peso objetivo** a partir del % de grasa objetivo y el peso libre de grasa actual (en lugar de elegir un peso arbitrario).
3. **Objetivos de macros personalizados** y dependientes del peso actual (proteína = peso × 1,6/2, grasa = 25 % de las kcal, fibra fija, carbs como resto).
4. **Biblioteca de recetas reutilizables** con ingredientes, gramos, raciones y cálculo automático de macros por ración.
5. **Diario de comidas con contadores** ("hoy comí 1 curry, 2 galletas, 1 café…") que recalcula calorías y macros consumidos en tiempo real.
6. **Base de datos de ingredientes** con macros por 100 g / por unidad reutilizable entre recetas.
7. **Histórico longitudinal** preparado para análisis de tendencias (peso, grasa, agua, músculo) durante años.

---

## 5. Funcionalidades a añadir en la futura app (sugerencias)

Más allá de replicar el Excel, hay áreas naturales para extender:

### 5.1 Nutrición y dieta

- **Buscador y escáner de código de barras** para añadir ingredientes (OpenFoodFacts / FatSecret / USDA).
- **Importar recetas desde URL** y autocalcular macros.
- **Plan de comidas semanal** y lista de la compra automática a partir de las recetas planificadas.
- **Ajuste dinámico de raciones** (escalar la receta para X personas o Y kcal objetivo).
- **Ciclos de calorías** (déficit/mantenimiento/recarga) y _macro cycling_.

### 5.2 Composición corporal

- **Integración con básculas inteligentes** (Withings, Renpho, Garmin, Apple Health, Google Fit) para evitar introducir manualmente.
- **Gráficas de tendencias** con regresión, predicción de fecha objetivo y alertas de estancamiento.
- **TDEE adaptativo**: recalcular el gasto calórico real a partir del balance peso ↔ kcal de las últimas 2-4 semanas.

### 5.3 Entrenamiento (no presente en el Excel actual, pero esperable en una app de gym)

- **Rutinas y planes de entrenamiento** (full body, push/pull/legs, etc.).
- **Registro de series, repeticiones, peso y RPE**, con histórico por ejercicio.
- **Cálculo de 1RM, volumen, intensidad y progresión** semana a semana.
- **Cronómetro de descanso** y temporizadores de superseries.
- **Biblioteca de ejercicios** con vídeos, músculos implicados y variantes (musclewiki o similar).
- **Cardio y NEAT**: pasos, sesiones de cardio, kcal aproximadas integradas con el wearable.

### 5.4 Salud y bienestar

- **Sueño** (horas, calidad) y **estado de ánimo** correlacionados con rendimiento.
- **Lesiones / molestias** (registro y exclusión automática de ejercicios).

### 5.5 Plataforma

- **Multidispositivo** (web + iOS + Android) con sincronización en la nube.
- **Modo offline** con sincronización diferida.
- **Compartir** rutinas y recetas; sistema de coach/cliente con roles.
- **Exportar/importar CSV** y backup, además de **importar el propio Excel actual** como punto de partida.
- **Notificaciones**: hora de pesarse, déficit/superávit del día.
- **Dashboard configurable** con widgets (peso, kcal restantes hoy, próximo entreno).
- **Privacidad**: datos de salud cifrados, login con biometría.

---

## 6. Modelo de datos sugerido (boceto)

A grandes rasgos, las entidades naturales que se desprenden del Excel son:

- `User` (peso inicial, % grasa objetivo, fecha de inicio, kcal base, etc.).
- `BodyMeasurement` (fecha, fuente: casa/gym/wearable, peso, %grasa, %agua, %músculo, perímetros…).
- `Ingredient` (nombre, kcal/100g, prot, carbs, grasa, fibra, unidad por defecto).
- `Recipe` (nombre, raciones, fotos, pasos) ↔ `RecipeIngredient` (cantidad en g/u).
- `MealLog` (fecha, receta o ingrediente suelto, número de raciones / gramos).
- `Goal` (fecha, % grasa objetivo, peso objetivo derivado, kcal/macros objetivo).
- _(Futuro)_ `Workout`, `Exercise`, `WorkoutSet`, `RoutineTemplate`.

Con esto, las pantallas mínimas del MVP serían: **Diario** (peso + comidas + macros del día), **Recetas**, **Ingredientes**, **Gráficas de progreso** y **Configuración de objetivos**.

---

_Generado a partir de `GYM Gonzalo.xlsx` — hojas Métricas, Resultados, Ingredientes._
