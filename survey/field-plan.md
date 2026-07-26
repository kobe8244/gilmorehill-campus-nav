# Field survey plan — Gilmorehill, four destinations

Generated from the current study area. Re-run `npm run survey:plan` if the
study area changes.

**Total: 68 segments + 20 entrances ≈ 6 h 20 min of fieldwork.**
Split over two sessions below. Doing it in two halves is recommended — the
measurements get careless after about three hours.

---

## Before you go

**Equipment**

| Item | Why |
| ---- | --- |
| Tape measure, 5 m+ (or a laser measure) | `width_m`, `door_width_m` — the most important column |
| Phone with a spirit-level / inclinometer app | `gradient_pct`. iPhone: Measure app → Level. Android: any "bubble level" |
| Phone with `survey/basemap.html` open | segment ids and your GPS position |
| A way to fill in the CSV | see "recording" below |
| Camera (the phone) | photograph anything unusual; put the filename in `notes` |
| High-vis or just care | some segments are `service` roads shared with vehicles |

**Recording — pick one before you leave**

- *Easiest:* open `segments.csv` in Excel or Google Sheets on the phone and
  type straight into it. Keep the column order intact.
- *Most reliable in rain:* print this plan, tick the boxes and write values
  in the margin, then type it up the same evening. Memory for "was that 1.2
  or 1.4 m" fades fast.

**Timing** — go on a dry weekday in daylight. Wet cobbles and low sun change
what you record about surface and lighting, and you cannot judge `lit` at all
in the middle of the day, so leave that column for one evening pass.

---

## How to measure each column

| Column | How | Trap to avoid |
| ------ | --- | ------------- |
| `step_free` | Can a wheelchair get from one end to the other with no step at all? | A single 5 cm lip still means `no` |
| `step_count` | Count every step including the top and bottom | — |
| `ramp` | Is there a ramp *as an alternative to the steps*? | A ramp that ends in a step is not a ramp |
| `handrail` | Continuous rail on at least one side | — |
| `gradient_pct` | Phone level flat on the ground, steepest part; degrees × 1.75 ≈ percent | Measure the **steepest** part, not the average |
| `surface` | Material underfoot | — |
| `surface_condition` | `good` / `uneven` / `poor` — would small front castors catch? | — |
| `width_m` | Clear width at the **narrowest** point, between real obstructions | Bins, bollards, café tables and parked bikes all count as the edge |
| `dropped_kerb` | At crossings: `flush` (level), `lowered` (slight lip), `raised` (full kerb), `none` | — |
| `tactile_paving` | The bumpy paving at crossings | — |
| `lit` | Street lighting present — **judge after dark** | — |
| `seating_nearby` | A bench within about 10 m; matters for older users who need to rest | — |
| `notes` | Anything a number cannot capture, and photo filenames | — |

**The two that matter most are `step_free` and `width_m`.** The app treats a
segment as surveyed only when both are filled; until then it warns the user
that the route is unverified. If you are short of time, fill those two on
every segment rather than filling everything on half of them.

---

## Field task 0 — the Hunterian Museum question

Do this first, before any measuring.

The data says the Hunterian Museum's only mapped approach is a 10 m flight of
steps (`s354`), and both entrances OSM knows about are tagged
`wheelchair=no`. So: **how does a wheelchair user actually get into the
Hunterian Museum?**

Go to the Main Building east quadrangle and find out. Ask at the museum desk
or the Main Building reception — staff will know, and it is faster than
hunting. Then record what you find:

- If there is an accessible entrance and a lift → add a row to
  `entrances.csv` with its coordinates, `accessible=yes`, and the lift
  described in `notes`. This becomes the museum's handover point.
- If there genuinely is no step-free access → record that too. A documented
  absence is a finding, and it is the strongest argument in your dissertation
  for why this work matters.

Either way, note the answer and who told you.

---

## Session 1 — Main Building, Hunterian Museum and James Watt (South)

**43 segments (13 core) · 16 entrances · 1343 m to survey · 739 m of retracing · about 4 h 12 min**

The southern half of the study area, and the more important of the two: it holds most of the core routes and the whole Hunterian access question. If you only ever do one session, do this one.

Start at **Main Building**, junction `n349`. Survey `core` rows first if you are short of time — they are the routes the app offers.

### Leg 1 — from junction `n349`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s353` | alt | 10 m | steps | at Main Building | **STEPS — count them, look for a ramp** |

> ↪ **Walk 10 m** from junction `n350` to `n349` without surveying — either already done, or a dead end you have to come back out of.

### Leg 2 — from junction `n349`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s352` | core | 20 m | footway | at Main Building | — |
| ☐ | `s159` | core | 10 m | footway | 33 m NW of Hunterian Museum | — |
| ☐ | `s160` | core | 19 m | footway | 49 m N of Hunterian Museum | — |
| ☐ | `s158` | alt | 18 m | footway | 49 m N of Hunterian Museum | — |
| ☐ | `s093` | core | 18 m | footway | 53 m N of Hunterian Museum | — |
| ☐ | `s092` | core | 15 m | footway | 63 m N of Hunterian Museum | — |

> ↪ **Walk 15 m** from junction `n105` to `n108` without surveying — either already done, or a dead end you have to come back out of.

### Leg 3 — from junction `n108`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s161` | core | 18 m | footway | 57 m N of Hunterian Museum | — |

> ↪ **Walk 18 m** from junction `n189` to `n109` without surveying — either already done, or a dead end you have to come back out of.

### Leg 4 — from junction `n109`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s094` | core | 19 m | footway | 25 m N of Hunterian Museum | — |
| ☐ | `s095` | core | 9 m | footway | at Hunterian Museum | — |
| ☐ | `s351` | core | 20 m | footway | at Hunterian Museum | — |
| ☐ | `s350` | core | 10 m | steps | at Hunterian Museum | **STEPS — count them, look for a ramp** |

> ↪ **Walk 39 m** from junction `n347` to `n47` without surveying — either already done, or a dead end you have to come back out of.

### Leg 5 — from junction `n47`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s038` | core | 21 m | service | 33 m N of Hunterian Museum | shared with vehicles |
| ☐ | `s039` | alt | 52 m | service | 71 m NW of Main Building | shared with vehicles |
| ☐ | `s340` | alt | 14 m | footway | 68 m NW of Main Building | — |

> ↪ **Walk 87 m** from junction `n339` to `n47` without surveying — either already done, or a dead end you have to come back out of.

### Leg 6 — from junction `n47`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s037` | core | 159 m | service | 61 m NE of Hunterian Museum | shared with vehicles |
| ☐ | `s043` | alt | 31 m | service | 137 m NE of James Watt Building (South) | shared with vehicles |

> ↪ **Walk 31 m** from junction `n52` to `n46` without surveying — either already done, or a dead end you have to come back out of.

### Leg 7 — from junction `n46`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s044` | core | 142 m | service | 26 m E of James Watt Building (South) | shared with vehicles |
| ☐ | `s497` | alt | 19 m | steps | at James Watt Building (South) | **STEPS — count them, look for a ramp** |
| ☐ | `s496` | alt | 11 m | steps | 41 m S of James Watt Building (South) | **STEPS — count them, look for a ramp** |
| ☐ | `s495` | alt | 17 m | footway | 54 m S of James Watt Building (South) | — |
| ☐ | `s009` | alt | 34 m | steps | 93 m S of James Watt Building (South) | **STEPS — count them, look for a ramp** |
| ☐ | `s138` | link | 13 m | pedestrian | 104 m S of James Watt Building (South) | open space — measure the usable width |
| ☐ | `s333` | link | 10 m | pedestrian | 98 m S of James Watt Building (South) | open space — measure the usable width |
| ☐ | `s334` | link | 179 m | pedestrian | 126 m NE of James Watt Building (South) | open space — measure the usable width |
| ☐ | `s335` | alt | 25 m | pedestrian | 148 m NE of James Watt Building (South) | open space — measure the usable width |

> ↪ **Walk 308 m** from junction `n95` to `n28` without surveying — either already done, or a dead end you have to come back out of.

### Leg 8 — from junction `n28`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s023` | alt | 34 m | service | 26 m S of James Watt Building (South) | shared with vehicles |
| ☐ | `s022` | alt | 46 m | service | 38 m SW of James Watt Building (South) | shared with vehicles |
| ☐ | `s212` | link | 3 m | footway | 77 m W of James Watt Building (South) | — |
| ☐ | `s216` | link | 6 m | steps | 75 m W of James Watt Building (South) | **STEPS — count them, look for a ramp** |
| ☐ | `s219` | link | 7 m | footway | 75 m W of James Watt Building (South) | — |
| ☐ | `s218` | link | 5 m | footway | 73 m W of James Watt Building (South) | — |
| ☐ | `s339` | alt | 13 m | footway | 73 m W of James Watt Building (South) | — |

> ↪ **Walk 34 m** from junction `n338` to `n26` without surveying — either already done, or a dead end you have to come back out of.

### Leg 9 — from junction `n26`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s021` | link | 42 m | service | 77 m W of James Watt Building (South) | shared with vehicles |
| ☐ | `s224` | link | 11 m | service | 70 m S of Main Building | shared with vehicles |
| ☐ | `s349` | alt | 6 m | footway | 70 m S of Main Building | — |
| ☐ | `s348` | alt | 28 m | footway | 36 m S of Main Building | — |
| ☐ | `s346` | alt | 16 m | pedestrian | 35 m SW of Main Building | open space — measure the usable width |
| ☐ | `s347` | alt | 99 m | pedestrian | at Main Building | open space — measure the usable width |

> ↪ **Walk 34 m** from junction `n345` to `n238` without surveying — either already done, or a dead end you have to come back out of.

### Leg 10 — from junction `n238`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s222` | link | 45 m | service | 69 m SW of Main Building | shared with vehicles |
| ☐ | `s214` | link | 6 m | footway | 78 m SW of Main Building | — |
| ☐ | `s338` | alt | 13 m | footway | 74 m SW of Main Building | — |

> ↪ **Walk 163 m** from junction `n337` to `n27` without surveying — either already done, or a dead end you have to come back out of.

### Leg 11 — from junction `n27`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s245` | alt | 50 m | service | 35 m NW of James Watt Building (South) | shared with vehicles |

### Entrances in this area (16)

| ✓ | entrance_id | Building | OSM says | Coordinates |
| - | ----------- | -------- | -------- | ----------- |
| ☐ | `main_building_4374873296` | Main Building | entrance=yes | 55.87099, -4.28800 |
| ☐ | `main_building_4374873349` | Main Building | entrance=yes | 55.87168, -4.28971 |
| ☐ | `main_building_4374873352` | Main Building | entrance=yes | 55.87187, -4.28852 |
| ☐ | `main_building_4374873355` | Main Building | entrance=yes | 55.87193, -4.28931 |
| ☐ | `james_watt_south_5171378847` | James Watt Building (South) | entrance=yes | 55.87090, -4.28685 |
| ☐ | `main_building_5179610537` | Main Building | entrance=yes | 55.87104, -4.28866 |
| ☐ | `main_building_5179610553` | Main Building | entrance=yes | 55.87116, -4.28930 |
| ☐ | `main_building_11938383690` | Main Building | entrance=yes | 55.87172, -4.28969 |
| ☐ | `main_building_11938383691` | Main Building | entrance=yes | 55.87154, -4.28977 |
| ☐ | `main_building_11938383718` | Main Building | entrance=yes | 55.87182, -4.28812 |
| ☐ | `main_building_7993590301` | Main Building | entrance=yes | 55.87183, -4.28934 |
| ☐ | `main_building_11938383694` | Main Building | entrance=yes | 55.87161, -4.28843 |
| ☐ | `main_building_11938383695` | Main Building | entrance=yes | 55.87129, -4.28856 |
| ☐ | `main_building_11938383697` | Main Building | entrance=yes | 55.87127, -4.28925 |
| ☐ | `hunterian_museum_11938383704` | Hunterian Museum | entrance=yes, wheelchair=no | 55.87167, -4.28819 |
| ☐ | `hunterian_museum_11938383713` | Hunterian Museum | entrance=yes, wheelchair=no | 55.87172, -4.28858 |

---

## Session 2 — University Library approach

**25 segments (3 core) · 4 entrances · 808 m to survey · 518 m of retracing · about 2 h 8 min**

The northern half: the routes up to the Library. Fewer core segments, but this is where the step-free alternatives to the direct routes live, so it is not optional.

Start at **University Library**, junction `n42`. Survey `core` rows first if you are short of time — they are the routes the app offers.

### Leg 1 — from junction `n42`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s091` | core | 16 m | footway | at University Library | — |
| ☐ | `s122` | alt | 15 m | footway | 40 m E of University Library | — |
| ☐ | `s124` | alt | 11 m | steps | 50 m E of University Library | **STEPS — count them, look for a ramp** |
| ☐ | `s125` | alt | 7 m | footway | 57 m E of University Library | — |
| ☐ | `s129` | alt | 16 m | footway | 61 m E of University Library | — |
| ☐ | `s283` | alt | 1 m | pedestrian | 67 m E of University Library | open space — measure the usable width |
| ☐ | `s286` | alt | 24 m | pedestrian | 58 m E of University Library | open space — measure the usable width |
| ☐ | `s285` | alt | 101 m | pedestrian | 89 m E of University Library | open space — measure the usable width |
| ☐ | `s126` | alt | 35 m | footway | 92 m E of University Library | — |

> ↪ **Walk 16 m** from junction `n153` to `n156` without surveying — either already done, or a dead end you have to come back out of.

### Leg 2 — from junction `n156`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s128` | alt | 53 m | footway | 79 m SE of University Library | — |
| ☐ | `s089` | core | 22 m | footway | 82 m SE of University Library | — |

> ↪ **Walk 22 m** from junction `n105` to `n106` without surveying — either already done, or a dead end you have to come back out of.

### Leg 3 — from junction `n106`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s090` | core | 63 m | footway | 41 m SE of University Library | — |

> ↪ **Walk 15 m** from junction `n107` to `n149` without surveying — either already done, or a dead end you have to come back out of.

### Leg 4 — from junction `n149`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s287` | alt | 23 m | footway | 51 m E of University Library | — |

> ↪ **Walk 54 m** from junction `n293` to `n42` without surveying — either already done, or a dead end you have to come back out of.

### Leg 5 — from junction `n42`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s034` | alt | 32 m | pedestrian | at University Library | open space — measure the usable width |
| ☐ | `s033` | alt | 45 m | pedestrian | 56 m S of University Library | open space — measure the usable width |
| ☐ | `s177` | alt | 7 m | service | 68 m S of University Library | shared with vehicles |

> ↪ **Walk 52 m** from junction `n208` to `n41` without surveying — either already done, or a dead end you have to come back out of.

### Leg 6 — from junction `n41`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s087` | alt | 75 m | service | 67 m W of University Library | shared with vehicles |
| ☐ | `s328` | alt | 10 m | service | 70 m W of University Library | shared with vehicles |
| ☐ | `s356` | alt | 19 m | service | 71 m NW of University Library | shared with vehicles |

> ↪ **Walk 19 m** from junction `n351` to `n328` without surveying — either already done, or a dead end you have to come back out of.

### Leg 7 — from junction `n328`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s357` | alt | 24 m | footway | 78 m W of University Library | — |

> ↪ **Walk 141 m** from junction `n323` to `n42` without surveying — either already done, or a dead end you have to come back out of.

### Leg 8 — from junction `n42`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s035` | alt | 36 m | pedestrian | 46 m NE of University Library | open space — measure the usable width |
| ☐ | `s288` | alt | 32 m | footway | 52 m NE of University Library | — |
| ☐ | `s086` | alt | 27 m | footway | 60 m NE of University Library | — |

> ↪ **Walk 27 m** from junction `n102` to `n101` without surveying — either already done, or a dead end you have to come back out of.

### Leg 9 — from junction `n101`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s085` | alt | 39 m | footway | 76 m N of University Library | — |

> ↪ **Walk 172 m** from junction `n99` to `n156` without surveying — either already done, or a dead end you have to come back out of.

### Leg 10 — from junction `n156`

| ✓ | Segment | Tier | Length | Type | Where it is | Watch for |
| - | ------- | ---- | -----: | ---- | ----------- | --------- |
| ☐ | `s284` | alt | 75 m | pedestrian | 90 m E of University Library | open space — measure the usable width |

### Entrances in this area (4)

| ✓ | entrance_id | Building | OSM says | Coordinates |
| - | ----------- | -------- | -------- | ----------- |
| ☐ | `university_library_7993589849` | University Library | entrance=yes | 55.87306, -4.28875 |
| ☐ | `university_library_7993589850` | University Library | entrance=yes | 55.87333, -4.28842 |
| ☐ | `university_library_7993589854` | University Library | entrance=yes | 55.87328, -4.28826 |
| ☐ | `university_library_7993589855` | University Library | entrance=yes | 55.87309, -4.28831 |

---

## What to record at every entrance

Is it step-free; how many steps if not; is there a ramp; the door type
(automatic / manual / heavy / revolving) and its clear width; and —
importantly — `indoor_handover_id`, the shared code you and the indoor team
agree on so the two systems hand over at the same door.

Record the ones that turn out to be unusable too. "This door is not
accessible" is data, and it is half of what the app needs in order to be
honest with a wheelchair user.

---

## When you get back

```bash
npm run survey:import     # folds your CSV into the app's network
npm run dev               # the app now routes on your measurements
```

Then commit the filled CSVs to git — they are the irreplaceable part of this
repository. Everything else can be regenerated; a walk across campus cannot.

Partial data is fine and expected. The app reports how much of each route has
been verified and draws the rest dashed, so you can survey in passes and
watch the coverage climb.
