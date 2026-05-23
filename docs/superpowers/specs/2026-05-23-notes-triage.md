# Notes Triage — 2026-05-23

Living inbox for a batch of raw notes (nutrition + training). Triage only — not a
spec. Each item: short ID, the raw note (as said, ES/EN preserved), linked image
if any, my read, and status.

Status values: `triage` (just logged) → `specced` (has its own design doc) →
`done` / `dropped`.

Reference images live in the gitignored `.brainstorm/` folder (local only).

---

## Upgrades — improvements to existing functionality

### U-1 — Sub-macros: carbs→(total, sugar), fat→(total, saturated)
- **raw:** "podemos desglosar hidratos en hidratos generales y azucar y grasas en
  grasa total y grasas saturadas? OFF tiene esta informacion? Podemos hacerla
  opcional pero que los usuarios puedan informarlo en los ingredientes."
- **read:** Add optional `sugar_g` and `saturated_fat_g` to the ingredient model;
  user-editable, nullable. Confirm OFF provides them (it does: `sugars_100g`,
  `saturated-fat_100g`). Schema + form + macro display + OFF import mapping.
  Enabler for U-3 (low-sugar filter).
- **decisions (2026-05-23):**
  - **Full roll-up (option B):** sugar + saturated fat propagate ingredient →
    recipe → meal log → daily total → planner (user wants a daily "sugar consumed"
    number). Extends the `Macros` core envelope (+`sugarG`, +`satFatG`), the edge
    parity net, and `daily_nutrition_history` columns.
  - **Honest-partial totals:** fields stay optional/nullable; a daily/recipe total
    sums only known values and surfaces a qualifier when some items lack data (e.g.
    "≥ 32 g sugar · 2 items missing"). Null ≠ 0 for sugar (sugar-free is a real
    value). Do NOT make the fields required (would break existing ingredients + the
    lenient OFF/barcode import).
- **spec:** `2026-05-23-sub-macros-design.md`
- **plan:** `../plans/2026-05-23-u1-sub-macros.md`
- **status:** implemented — PR #95 into develop (lint/build/typecheck/test green). Gated:
  apply migration `20260525120000_u1_sub_macros.sql` to prod + deploy
  `daily-nutrition-snapshot` (ordered: migration → merge → edge deploy).

### U-2 — Recipe meal-type tagging
- **raw:** "tambien podemos poner una seccion en las recetas para que los usuarios
  pongan si la receta es para desayuno, comida, cena, etc o para varias a la vez"
- **read:** Tag a recipe with one-or-more meal types (breakfast/lunch/dinner/snack…).
  Many-to-many or array column. Enabler for U-3.
- **decisions (2026-05-23):** flat 5-tag vocabulary locked —
  `breakfast / lunch / snack / dinner / dessert` (snack doubles as merienda; dessert
  is recipe-only). Stored as `recipes.meal_types text[]` (array, not junction) with a
  subset CHECK + GIN index; optional/multi-valued; saved atomically via a new
  `p_meal_types` arg on the existing `save_recipe` RPC. Logging enum left untouched.
- **spec:** `2026-05-23-recipe-meal-types-design.md`
- **status:** specced (awaiting user review of the spec before writing the plan)

### U-3 — Recipe search filters (nutrition-aware + meal-type)
- **raw:** "con esta informacion podemos mejorar el buscador de recetas. Podemos
  añadir filtros por 'high protein', 'low carb', 'low sugar', etc. tambien podemos
  buscar por recetas para desayuno, cena, etc."
- **read:** Filter/search recipes by macro profile (high-protein, low-carb,
  low-sugar) and by meal type. Depends on U-1 (sugar) + U-2 (meal type). Need to
  define the thresholds for each label (per-serving or per-100kcal?).
- **decisions (2026-05-23):** density/ratio basis (% of per-serving energy). Two
  label kinds — **goal filters** (searchable: high protein 30%E, low carb 25%E, low
  fat 30%E, high fiber 6g/100kcal, low sugar 10%E⚠, low sat-fat 10%E⚠) and **warning
  badges** (display-only: high sugar 20%E⚠, high sat-fat 10%E⚠). One pure helper
  `recipeLabels()` is the single source for badges + filter predicates. In-memory
  compute via the existing macro core (no SQL macro math); ⚠ labels gated on complete
  data (U-1); faceted combine (within meal-types OR, across AND).
- **spec:** `2026-05-23-recipe-search-filters-design.md`
- **status:** specced (awaiting user review of the spec before writing the plan)

### U-4 — Extract more from OFF (Nutri-Score? NOVA?)
- **raw:** "what other relevant information can we extract from OFF? maybe nutrition
  score?"
- **read:** Research item. OFF exposes Nutri-Score (`nutriscore_grade`), NOVA group
  (`nova_group`), Eco-Score, allergens, ingredient list. Decide which add user value
  vs. clutter. Likely display-only.
- **status:** triage

### U-5 — Planner shows daily totals vs. target while planning
- **raw:** "en el planing de nutricion, hay que tener en cuenta el objetivo del
  usuario para calcular las calorias y macros que tiene que consumir a dia y mostrar
  el total de cada dia mientras se planifica, de esta manera el usuario sabe si se
  esta pasando o quedandose corto."
- **read:** While planning a day, surface the user's phase-derived target kcal/macros
  and the running day total, with over/under feedback. Targets already exist
  (`computeDailyMacroTargets`, R-05). This is wiring + UI in the planner.
- **decisions (2026-05-23):**
  - **Scope:** planner (`WeekGrid`, summary at top of each day card) **and** the
    template editor (`TemplateGrid`, a "Total" row per day column). Same shared
    `<DaySummary>` component; reference target = the user's current phase target,
    applied to all days. Meal-cell restyle → **deferred to U-8**.
  - **Phase-aware kcal bands** (absolute margins): cut → blue `<−50` / green `±50` /
    amber `+50…+100` / red `>+100`; bulk → red `<−50` ("no llegas", incl. today) /
    green `−50…+200` / amber `>+200`; maintenance → existing ±5% band, unchanged.
  - **Macros:** protein/fibra are floors (over = **dark-green** excess; under = silent
    grey — the old low-fiber amber/warning is **removed**). Grasa gains an
    **essential-fat floor = 20%E** (below → red "⚠ Falta grasa" + min-line tick + `?`).
    Carbs/grasa over → **dark-red** excess. `?` lives inside an aviso (no aviso → no `?`).
  - **Shared classifier** (`classifyMacro`) moves to `src/lib/macroStatus.ts`; the bar
    changes also apply to the Diario `DayTotalsCard` (intended consistency).
  - **Display-only** — no SQL macro math, no edge/parity changes; macros computed
    in-memory via the existing core from an ingredient-bearing fetch.
- **spec:** `2026-05-23-planner-day-targets-design.md`
- **status:** specced (awaiting user review of the spec before writing the plan)

### U-6 — Copy/paste a "meal" across days
- **raw:** "hay que añadir la opcion en el creador de templates y en el planificador
  de copiar un 'meal' para poder usarlo otros dias… poder duplicarlo/copiar-pegar el
  resto de dias."
- **read:** Duplicate a planned meal (e.g. Monday breakfast) to other days in both
  the template editor and the planner. UX + mutation.
- **status:** triage

### U-7 — Recipe editor: defer ingredient dropdown until typing
- **raw:** "cuando se crea una receta, no tiene que abrirse un desplegable hasta que
  no se empieza a buscar el ingrediente. No tiene sentido ya que solo muestra unos
  cuantos ingredientes."
- **read:** Small UX fix — the ingredient picker should not open its list on focus;
  only after the user starts typing a query.
- **decisions (2026-05-23):** open the dropdown only when `query.trim()` is non-empty
  (≥1 char; local search is in-memory so no 2–3 char gate); empty focus shows nothing
  (no dropdown, no "recents"), and the empty-query local search is not run. The
  "+ Crear «X»" affordance is unchanged. Isolated to `IngredientAutocomplete`.
- **spec:** `2026-05-23-ingredient-picker-defer-design.md`
- **status:** specced (awaiting user review of the spec before writing the plan)

### U-8 — Visual attractiveness pass (richer styling, NOT fewer tables/graphs)
- **raw:** "I want a more visual atractive app and website. Right now there is a lot
  of graphs and tables but not enough visual attractiveness." — clarified: keep the
  tables/graphs; the site is too plain and needs to be more visually stimulating.
- **image:** `muscles-icons.jpeg` (muscle-group browse cards with icons)
- **read:** Cross-cutting visual/design direction, not a single change. The data
  density stays — the goal is a richer, more stimulating visual treatment of what's
  already there (and new surfaces). The muscle-icon "Find a workout" browse screen is
  the style example. Likely informs the training refactor and a home/dashboard
  redesign. Needs its own design pass.
- **status:** triage

---

## New Features — net-new functionality (each needs its own spec)

### F-1 — Whole-foods database (basic produce/meats, no barcode)
- **raw:** "I have some databases of foods… search for basic vegetables, fruits,
  meats, etc and add them to the database… OFF works for packaged food, but not
  whole foods without a barcode. or you can get info from bedca database, since its
  spanish? because the databases I have are from germany and other countries so we
  will need to translate them."
- **read:** Seed/import a whole-foods reference set. Data-source decision: BEDCA
  (Spanish food composition DB) preferred over translating the German DBs the user
  has. Interacts with R-01 shared-pool library model + the metric-only invariant.
  Licensing of BEDCA needs checking.
- **status:** triage

### F-2 — Training routines + non-week-based planner
- **raw:** "I want a way to create routines. The planner can be similar to the
  nutrition one but needs to accept things like 3 work out days, 2 rest days
  (non week based) and repeat. In the routines, I want to be able to set rest times
  between sets."
- **read:** A routine builder + a training planner that repeats an N-day cycle (not
  Mon–Sun). Per-exercise/per-set configurable rest times stored on the routine.
  Builds on R-19 training MVP (sessions/sets exist). Major.
- **status:** triage

### F-3 — Guided active-workout mode (rest timer + inline logging)
- **raw:** "temporizador de descanso que durante el descanso te pide lo que has hecho
  de repes." + "press a button to start the workout and the app guides me through
  everything: the exercise I need to do, a button to start the rest time, while i'm
  in the rest, ask me to input the reps, weights, etc (autocompleted from the last
  workout of the same exercise)."
- **image:** `log-sets.jpeg` (set-logging sheet: rep stepper, weight field, Record
  Set, quick plate increments, compared-to-previous)
- **read:** A "start workout" runner that steps through the routine's exercises,
  with a rest timer that prompts for reps/weight (prefilled from the last session of
  that exercise). Folds in the standalone rest-timer note. Depends on F-2 (routines).
- **status:** triage

### F-4 — Muscle activity visualization (body heatmap)
- **raw:** "we can also display something like this, where we display the muscles that
  the user worked the most and then a gradient to the least one."
- **image:** `muscles-gradient.jpeg` (front/back body silhouette shaded by volume +
  per-muscle %, 7d/30d toggle)
- **read:** A "body activity" view: per-muscle volume over a window, rendered as a
  shaded body map + ranked %. Needs each exercise mapped to muscle group(s) — a data
  model addition on `exercises`. Part of the visual direction (U-8).
- **status:** triage

### F-5 — Micronutrient storage (DEFERRED — pairs with F-1)
- **raw:** "what do you think about storing micronutrients? would that be too much?"
- **read:** Store vitamins/minerals (and possibly fatty-acid breakdown) per
  ingredient. Deferred deliberately, for two reasons: (1) **data source** — OFF
  reliably has only the "big 8" (energy/fat/sat-fat/carbs/sugar/protein/salt/fiber)
  and almost no vitamins/minerals, so micros would be mostly "unknown" noise until a
  whole-foods composition DB exists. Micros are naturally a child of **F-1 (BEDCA)**,
  whose whole purpose is rich nutrient profiles. (2) **shape** — micros must NOT
  extend the tight 5-field `Macros` core; they want a flexible store
  (`ingredient_nutrients(ingredient_id, nutrient_key, amount_per_unit)` or JSONB)
  with their own lazy roll-up. Design this *with* F-1, once a composition source is
  picked.
- **status:** triage (deferred to after F-1)

---

## Bugs

### B-1 — Save recipe should navigate to the recipe list
- **raw:** "cuando se guarda una receta, tiene que enviarte a la lista de recetas, no
  quedarse dentro."
- **read:** After a successful recipe save, redirect to the recipe list instead of
  staying in the editor. Small.
- **status:** triage

### B-2 — Add-exercise broken on /training/new (deferred)
- **raw:** "no funciona la funcionalidad de añadir ejercicios en la pagina
  /training/new. Tienes que buscar el bug pero no es necesario arreglarlo justo ahora
  ya que vamos a hacer refactor con todas las nuevas cosas que te he dicho."
- **read:** Adding exercises on `/training/new` doesn't work. User wants it
  investigated but NOT fixed now — the training refactor (F-2/F-3) will rework this
  surface anyway. Find root cause, log it, defer the fix.
- **status:** triage (fix deferred to training refactor)

---

## Clusters / observations

- **Nutrition data richness:** U-1, U-2, U-3, U-4, F-1 hang together (richer food
  data → better tagging → better search). Natural to sequence U-1+U-2 before U-3.
- **Nutrition planner:** U-5, U-6 are independent planner improvements.
- **Nutrition quick wins:** U-7, B-1 are tiny, shippable now.
- **Training refactor (the big one):** F-2, F-3, F-4, B-2, and the visual direction
  (U-8) form one large effort the user explicitly flagged as a coming refactor.
  Likely decomposes into multiple specs (routines model → planner → active-workout
  runner → muscle-map viz).
