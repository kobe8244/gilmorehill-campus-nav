# Findings — outdoor accessible navigation, Gilmorehill campus

Generated from the survey data by `npm run survey:report`. Every figure
below is computed by the same model the application routes on, so the
tables cannot drift away from the running system.

Study area: four destinations, 68 path segments (2.15 km), 20 building entrances.

Accessibility criteria throughout are from the Department for Transport
(2021) *Inclusive Mobility: A Guide to Best Practice on Access to
Pedestrian and Transport Infrastructure*, cited by section.

---

## Table 1 — What OpenStreetMap already records

Coverage of accessibility attributes across the 500 path segments
downloaded for the study area, before any fieldwork.

| OSM tag | Segments tagged | Coverage |
| ------- | --------------: | -------: |
| `surface` | 369 / 500 | 74% |
| `lit` | 114 / 500 | 23% |
| `handrail` | 74 / 500 | 15% |
| `incline` | 72 / 500 | 14% |
| `ramp` | 60 / 500 | 12% |
| `step_count` | 55 / 500 | 11% |
| `tactile_paving` | 51 / 500 | 10% |
| `wheelchair` | 12 / 500 | 2% |
| `smoothness` | 10 / 500 | 2% |
| `ramp:wheelchair` | 3 / 500 | 1% |
| `width` | 1 / 500 | 0% |
| `kerb` | 0 / 500 | 0% |

The two attributes that most often decide whether a wheelchair journey is
possible — clear width and dropped kerbs — are recorded for essentially
nothing. This is the gap the survey fills.

---

## Table 2 — Survey coverage

| | Count | Share |
| --- | ---: | ---: |
| Segments with both step-free status and width recorded | 53 / 68 | 78% |
| Segments partly recorded | 15 / 68 | 22% |
| Study network measured, by length | 1835 m / 2151 m | 85% |
| Entrances recorded | 20 / 20 | 100% |

---

## Table 3 — Which journeys are possible, by traveller

Distance in metres, or *none* where no usable route exists. A journey ends
at an entrance the traveller can actually use, not merely at the building.

| Journey | Step-free (wheelchair) | Walks with difficulty | Visually impaired | Shortest route |
| --- | ---: | ---: | ---: | ---: |
| Main → Hunterian Museum | *none* | *none* | 10 m | 10 m |
| Main → Library | 167 m | 167 m | 167 m | 167 m |
| Main → James Watt | 352 m | 352 m | 352 m | 352 m |
| Hunterian Museum → Library | *none* | *none* | 176 m | 176 m |
| Hunterian Museum → James Watt | *none* | *none* | 340 m | 340 m |
| Library → James Watt | 454 m | 454 m | 454 m | 454 m |

**3 of 6 journeys are step-free.** The failures all involve the Hunterian Museum.

---

## Table 4 — What stops a wheelchair user

| Barrier | Segments | Which |
| --- | ---: | --- |
| no way through | 15 | s085, s086, s129, s212, s214, s216, s218, s283, s285, s286, s287, s346, s349, s356, s357 |
| steps | 7 | s009, s124, s219, s350, s353, s496, s497 |
| raised kerb with no dropped crossing | 5 | s124, s350, s353, s496, s497 |
| too steep (N%) | 3 | s350, s353, s497 |
| only N m wide | 1 | s128 |

Thresholds applied: steps block outright; clear width below 1 m (§4.2); gradient above 8.33%, that is 1 in 12 (§4.3); a raised kerb with no dropped crossing (§4.11).

---

## Table 5 — Where the network is cut

Each row is a single segment which, if it were made passable, would open
the given number of further journeys. This identifies where remedial work
would have the most effect.

| Segment | Type | Length | Why it is impassable | Journeys it would restore |
| --- | --- | ---: | --- | ---: |
| `s350` | steps | 10 m | 25 steps; too steep (10%); raised kerb with no dropped crossing | +3 |
| `s353` | steps | 10 m | 25 steps; too steep (10%); raised kerb with no dropped crossing | +1 |

Baseline: 3 of 6 journeys step-free.

---

## Table 6 — Entrance survey

| Building | Entrances | Usable by a wheelchair | Narrower than the 1.2 m §11.2 asks for |
| --- | ---: | ---: | ---: |
| Main Building | 13 | 9 | 3 |
| James Watt Building (South) | 1 | 1 | 0 |
| University Library | 4 | 4 | 0 |
| Hunterian Museum | 2 | 2 | 2 |

### The Hunterian Museum

OpenStreetMap tags both mapped entrances to the Hunterian Museum
`wheelchair=no`, and its only mapped approach is a flight of steps. On
that evidence the museum is unreachable. The survey found otherwise: all
2 entrances were confirmed usable on site, each with a lift to
level 2.

The barrier is therefore not the door but the ground in front of it — the
outdoor approaches remain cut by steps. That is a more precise and more
actionable finding than the mapped data supports, and it could only have
been established on foot.

---

## Table 7 — Distance against the recommended limit without a rest

Inclusive Mobility §3.4 gives a distance each group can be expected to
manage before needing to rest; §4.5 asks for seating at intervals of no
more than 50 m.

| Journey | Length | Wheelchair (150 m) | Walks with difficulty (50 m) | Rest points on route |
| --- | ---: | --- | --- | ---: |
| Main → Hunterian Museum | 10 m | within | within | 0 |
| Main → Library | 167 m | exceeded | **exceeded** | 0 |
| Main → James Watt | 352 m | exceeded | **exceeded** | 0 |
| Hunterian Museum → Library | 176 m | exceeded | **exceeded** | 1 |
| Hunterian Museum → James Watt | 340 m | exceeded | **exceeded** | 0 |
| Library → James Watt | 454 m | exceeded | **exceeded** | 1 |

Across the whole study network only **3 of 68 segments** have a rest point within reach. Every journey exceeds the 50 m limit for stick and cane users, so for that group seating provision is not a comfort but the thing that decides whether the journey can be made at all.

---

## Limitations

- **Penalty weights are not empirically grounded.** The thresholds that
  decide whether a route is *possible* are all sourced from Inclusive
  Mobility. The multipliers that decide which of several possible routes is
  *preferred* are the author's estimates, and need literature support or
  user preference data before any claim is made about route quality.
- **Crossfall was not recorded.** §4.3 sets a maximum crossfall of 1 in 40
  and notes that variable crossfalls trouble wheelchair users and people
  with a balance impairment. The survey captures longitudinal gradient
  only, so a path that is within the gradient limit but tilted across its
  width would not be distinguished from a level one.
- **Rest points are modelled per segment, not cumulatively.** §3.4 concerns
  distance travelled since the last rest; A\* costs each segment
  independently, so the model prefers segments that pass a bench and
  reports when a route exceeds the recommended limit, rather than
  guaranteeing a rest within it.
- **15 segments are not fully measured.** They are treated as
  unknown rather than passable, and routes crossing them are reported as
  unverified.
- **Single surveyor, single pass.** No inter-rater reliability check was
  possible, and conditions such as surface state and lighting were recorded
  on one occasion.
