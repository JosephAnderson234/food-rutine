# Meal Prep Planner — Spec condensada

> Fuente: prototipo `docs/base.html` + contexto del proyecto. Este documento reemplaza al prototipo como referencia.

## 1. Qué es

Una herramienta personal (usuario #1: yo, estudiante UTEC con gym 3×/semana), diseñada para que otros la puedan usar después.
Resuelve **una sola cadena**:

```
Horario (Google Calendar) → huecos → Gym + Meal Prep
  → Sesiones de prep → Componentes → PORCIONES (ciclo de vida)
  → Hoy / Mochila · Compras − Inventario · Recordatorios
```

**Idea central:** la unidad del sistema es la **Porción**, no la receta. Si el sistema sabe dónde está cada porción, en qué estado y para qué día es, el resto se deriva automáticamente.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Alcance | Personal, pero con un modelo genérico (utensilios, horario y recetas configurables; mis datos van como seed) |
| Stack | Next.js 16 (App Router) + React 19 + Tailwind 4 + TS + Biome + pnpm (ya instalado) |
| Datos | **Local-first**: IndexedDB (Dexie). Funciona offline. Sync en la nube = futuro |
| Auth | Login con Google, **solo** para Calendar (y la IA desde el servidor) |
| Horario | Google Calendar. **Fijo vs flexible por calendario**: el usuario marca qué calendarios son fijos (p. ej. "UTEC") |
| Escritura | La app crea eventos de Gym y Meal Prep en un calendario propio ("Meal Prep") al aceptar una propuesta |
| Planificación | **Motor determinista** (plantillas + reglas) + **IA opcional** con internet |
| Porciones | Por hambre (normal / grande, +ajuste en día de gym). **Calorías y proteína solo se miden y se muestran**, sin metas |
| Variedad | **Rotación de 2–3 semanas** de plantillas (Semana A, B, C) |
| Orden del MVP | 1. Semana → 2. Hoy + Mochila → 3. Compras + Inventario → 4. Modo cocina guiado |

## 3. Modelo de dominio

```
Ingredient      id, nombre, categoría, unidad, kcal/100g, proteína/100g, perecible
Equipment       wok (capacidad ~1–1.5 porciones → tandas), sartén, arrocera, táperes, gel packs, lonchera
Component       algo que se cocina en lote: "pollo salteado", "arroz", "verduras", "carne molida", "pasta"
                → ingredientes por porción, pasos, utensilio, rendimiento por tanda
Assembly        un plato del día = componentes + acabado ("chaufa" = arroz + pollo + huevo, en wok, 10 min)
PrepTemplate    sesión reutilizable: componentes × N porciones + qué días cubre + assemblies por día
Rotation        [Semana A, Semana B, Semana C] → cada una asigna PrepTemplates a Dom/Mié
PrepSession     instancia de un template en una fecha concreta (colocada en un hueco del calendario)
Portion         ★ id, componente(s), taper, cocinada_en, destino (fecha + comida),
                estado: fridge | frozen | thawing | packed | eaten | discarded
                vence_en (derivado de las reglas de seguridad)
Container       taper #n, capacidad, ocupado por Portion?
InventoryItem   ingrediente, cantidad
ScheduleEvent   (de Google) inicio, fin, fijo|flexible, fuente
```

### Reglas de seguridad → validaciones, no texto

- En la refrigeradora: máximo 3–4 días desde la cocción. Si el destino queda después de eso → **congelar** y crear la tarea "mover al refri" la noche anterior.
- Refrigerar dentro de 2 h (o 1 h si hace más de 32 °C), en recipientes poco profundos.
- Temperatura interna: pollo 74 °C, carne molida 71 °C (se muestra en el modo cocina).
- Una porción recalentada o que estuvo en la mochila **no vuelve** a ser una porción válida.

## 4. Vistas del MVP

1. **Semana**: 7 días con cursos fijos (grises), eventos flexibles, gym, prep, qué se come y tareas de frío. Botón "Aceptar semana", que escribe gym y prep en Calendar.
2. **Hoy + Mochila**: próxima comida, qué táper llevar, checklist de la lonchera, qué sacar del congelador esta noche y gym sí/no.
3. **Compras + Inventario**: lista = necesidades del plan − inventario, agrupada por categoría y marcable en el súper. Al marcar, suma al inventario.
4. **Modo cocina**: pasos de la sesión ordenados (primero la arrocera, luego el wok en tandas mientras tanto), temporizadores y armado final de táperes (asigna Portion ↔ Container + etiqueta).

## 5. IA (Claude, solo online, siempre como *propuesta* que el usuario acepta)

- **Rearmar semana rota**: "parcial el jueves" → reubica el prep, congela porciones o propone una sesión corta.
- **Variantes de armado** con los componentes ya cocinados y solo con mis utensilios.
- **Nuevas plantillas de prep**: se guardan como PrepTemplate determinista.
- **Captura por texto/voz**: "compré 1 kg de pollo" → actualiza el inventario.

Salidas siempre estructuradas (schema) → acciones sobre el modelo, nunca texto libre aplicado directo.

## 6. Arquitectura

```
src/
  domain/        lógica pura TS, sin React: schedule, catalog, prep, portions, safety, shopping, packing, nutrition
  data/          Dexie (IndexedDB), seed con mi horario/recetas/equipo
  integrations/  google-calendar (server), ai (server)
  app/           rutas Next: /semana, /hoy, /compras, /cocina, /ajustes, /api/*
  components/    UI
```

El dominio se testea sin UI. La UI solo lee del estado y llama funciones del dominio.

## 7. Fuera del MVP

Sincronización en la nube multi-dispositivo · notificaciones push (por ahora se usan los recordatorios de Calendar) · gestión avanzada de táperes · onboarding para otros usuarios · presupuesto.

## 8. Decisiones adicionales

- **Recordatorios** (descongelar, preparar lonchera): se crean como eventos en el calendario "Meal Prep" de Google, con notificación.
- **IA**: Groq como proveedor (vía AI SDK).
- **Rotación**: se precarga la Semana A (Dom pollo+arroz+verduras / Mié carne+arroz/pasta+verduras). B y C después.
- **Nutrición**: Tablas Peruanas de Composición de Alimentos (INS/CENAN) como fuente de kcal/proteína.
- **Porción estándar**: ~150 g proteína cocida + ~1 taza arroz cocido (~180 g) + ~1 taza verduras; "grande" y día de gym ≈ +30 %.

- **Calendario fijo**: los cursos hoy están mezclados en el calendario principal. Se mueven a un calendario dedicado **"Utec Courses"**, que la app marca como fijo; el resto de calendarios se tratan como flexibles.
  - Vive en la cuenta Google de UTEC (Workspace). ✅ Verificado 2026-09-25: el OAuth (modo Prueba) funciona con esa cuenta.
  - Los eventos traen `location`: aula (presencial) o link de Zoom (virtual). **Día solo con clases virtuales = se come en casa, no hay mochila.**

## 10. Estado

- ✅ Pasos 1–2: `src/domain/` (motor puro + tests) y `src/data/` (Dexie + seed con Semana A y horario real). `pnpm test` · `pnpm typecheck`.
- ⚠️ Valores nutricionales en `src/data/seed/ingredients.ts` son aproximados a las TPCA 2017; verificar contra la tabla oficial.
- ✅ Paso 3: vista Semana (`/semana`): navegación entre semanas, días plegables, comidas con táper/estado/kcal, avisos, recalcular.
- ✅ Paso 4: Hoy + Mochila (`/hoy`): próxima tarea, alertas de seguridad, comidas con acciones (descongelar/empacar/comido/descartar), mochila con checklist, agenda marcable, pendientes de días anteriores y vista de mañana.
- ✅ Paso 5: Compras + Inventario (`/compras`): 1 o 2 compras (una por meal prep), aviso de congelar carne cruda si no llega fresca a su prep (USDA: cruda 1–2 días en refri), lista marcable por compra, básicos a revisar, inventario de casa que descuenta.
- ✅ Paso 6: Modo cocina (`/cocina`): selector de sesión, checklist previo, panel en vivo (qué hacer ahora, qué corre solo, atraso), pasos con barra de tiempo activa/pasiva, tandas y temperatura segura, armado de táperes con texto de etiqueta y destino (refri/congelador).
- ✅ Paso 6b: Modo guía (pantalla completa, un paso a la vez): cantidades por tanda en medidas de cocina, nivel de fuego, subpasos, "listo cuando", consejos, temporizadores persistentes con vibración/sonido, pantalla siempre encendida (Wake Lock).
- ✅ Recalcular conserva lo ya cocinado (`carryOver`): estado, táper y plato de porciones cuyo prep ya ocurrió.
- ✅ Paso 7: Google Calendar (solo navegador, GIS token model): Ajustes → conectar, roles fijo/flexible por calendario, traer horario (caché por semana para offline + recálculo), enviar a calendario propio «Meal Prep» (diff idempotente por `extendedProperties`). Guía: `docs/GOOGLE_SETUP.md`.
- ⏭️ Siguiente: IA con Groq, luego PWA.

## 11. Identidad visual

- Sin emojis: el dominio usa claves semánticas (`FoodIcon`, `TaskKind`, `DayMode`) y la UI las dibuja con **Phosphor Icons** (peso *duotone*) en `src/components/ui/icons.tsx`.
- Tipografía: **Bricolage Grotesque** (títulos, ancho 88), **Instrument Sans** (texto), **JetBrains Mono** (horas y cifras). Nada de Geist.
- Paleta "cocina": papel cálido + tinta + terracota (claro) / carbón + coral (oscuro), con textura de grano sutil.
- **Motion** para transiciones (acordeón de días, pill de navegación, stagger), respetando `prefers-reduced-motion`.
- Indicador de desarrollo de Next desactivado (`devIndicators: false`).
