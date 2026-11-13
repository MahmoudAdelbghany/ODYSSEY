# ODYSSEY / ORBITAL
## Art direction and interaction concept

**Status:** implemented through Milestone 03. This document remains the design thesis.

---

## 1. The thesis

ODYSSEY is not a website about planetary analogs. It is an **instrument for planetary exploration**, used by a civilization that already operates on the Moon and Mars.

The planet is not a background. The planet is the interface.

Information does not live in panels beside the planet. It exists **on, around and between** planetary locations. The interface behaves like a scientific instrument: engraved, precise, dimensional, quiet, and alive.

The test is not "does it look futuristic." The test is:

> If the logo were removed, would this feel like a system an interplanetary agency actually uses?

No sidebars. No dashboard cards. No metric grids. No navigation tabs. No search bar. No SaaS chrome.

---

## 2. Why the current interface fails

The current version is technically stronger but structurally the same:

- a globe on the left
- a 440px information panel on the right
- a vertical icon rail
- a top navigation bar
- a bottom input box

Removing borders, adding transparency, enlarging numbers or adding `REV 2050.4` does not change that structure. It is a dashboard with better materials.

The redesign must change **where information exists**, not only how it is styled.

---

## 3. The spatial model

The experience has three concentric layers.

```
                         ORBITAL LAYER
                  candidate nodes, experiment arcs,
                  temporal ring, campaign ribbon
                 .-~~~~~~~~~~~~~~~~~~~~~~~~~~~~-.
               .'                                  '.
             .'          INSTRUMENT LAYER            '.
            /       engraved labels, reticles,         \
           |        site lenses, measurement ticks       |
           |                                              |
           |              PLANETARY LAYER                 |
           |        surface, atmosphere, data fields       |
            \                                              /
             '.                                          .'
               '._                                  _.'
                  '-.~~~~~~~~~~~~~~~~~~~~~~~~~~~~.-'
```

### Planetary layer
The Earth. Photoreal day/night rendering, atmospheric scattering, clouds with soft shadows, ocean specular, city lights, real terrain at regional scale. Scientific fields are rendered as material properties of the planet, not as floating cards.

### Orbital layer
Candidate sites, experiments, temporal windows and campaign routes live in orbit around the planet as thin arcs, nodes and filaments. This is where the mission structure is visible.

### Instrument layer
A small number of engraved, screen-space annotations: a site lens, measurement ticks, a temporal readout, a command line. They are attached to a referent in the scene and disappear when the referent is out of view.

---

## 4. Navigation: the Orbital Ring

There is no sidebar and no tab bar.

A thin **operation ring** orbits the planet at a slight tilt. It has six engraved segments:

```
             01 BRIEF
       06 CAMPAIGN    02 ANALYZE
          \               /
           \    EARTH    /
           /             \
       05 INTERVENE   03 EXPLORE
             04 TIME
```

- The active segment is a thin line of warm ivory light; the others are etched and nearly invisible.
- Hovering a segment names the operation at the center-left of the screen.
- Selecting a segment changes the camera altitude and the planet's visual state.
- The ring is part of the 3D scene, not a web control. It rotates with the camera but remains readable.
- On narrow screens, the ring becomes a horizontal **operation arc** at the bottom, with the same typography and no boxes.

The ring is the only persistent navigation. Everything else is contextual.

---

## 5. Information: the site lens

When a site is selected, information does not slide in from the right.

A **site lens** unfolds from the location itself: a thin, clipped glass plane anchored to the site in 3D, connected by a single hairline. It contains only what is needed to decide:

- site name, country, analog type
- ML score and uncertainty
- the three strongest dimensions
- field window
- campaign role
- one clear action: **DIVE**

The lens is not a card. It has no rounded corners, no drop shadow, no filled header. It is an engraved transparent plane with a single lit edge.

Selecting **DIVE** transitions into a **site orbit**:

- the planet recedes to a crescent
- the lens expands into a radial instrument around the site
- six dimension arcs surround the location
- live weather and seismic data appear as annotations at the perimeter
- suggestions and limitations are engraved notes, not list rows
- a single gesture returns to planetary view

This is the core interaction of the product: **global planet → site lens → site orbit → campaign**.

---

## 6. The six operations

Each operation is a distinct spatial experience, not a different panel.

### 01 / Initialization

The planet hangs in darkness. A single vertical seam of light. The mission question is set in monumental type. A thin command line waits at the bottom. The brief is not a card; it is an engraved strip that expands when touched.

Initialize:
- a ring of light contracts around the planet
- the camera pulls back, then forward
- the starfield gains parallax
- the operation ring appears
- the planet's atmosphere brightens once, then settles

This feels like bringing a spacecraft system online.

### 02 / Decomposition

The planet recedes. A spatial constellation appears:

```
                    MISSION
                  /    |    \
          EXPERIMENT  EXPERIMENT  EXPERIMENT
             /          |           \
        REQUIREMENT  REQUIREMENT  REQUIREMENT
                 \       |       /
                    PLANET
```

Experiments are nodes in orbit. Requirements are filaments that connect to the planet's surface. The user can orbit the structure. Hovering a requirement highlights the planetary regions that satisfy it.

No panel. The structure is the interface.

### 03 / Discovery

The planet becomes a search space.

- a thin scan wave crosses the surface
- candidate regions emerge as vertical filaments of light
- the strongest candidates rise above the surface as engraved names
- a **candidate spine** appears at the left edge: a vertical list of names and scores with no backgrounds
- selecting a candidate flies the camera down and opens the site lens

This is a global search operation, not a table.

### 04 / Temporal intelligence

A **temporal ring** orbits the planet. Months are engraved ticks. A small sun marker moves along the ring. As it moves:

- the terminator shifts north and south
- the planet's lighting changes
- seasonal suitability fields bloom and fade on the surface
- the selected site's field windows appear as arcs on the ring
- the current month and solar declination are engraved at the ring

The user drags the ring; the planet responds. No bar chart.

### 05 / Environmental interventions

The site orbit becomes a **condition shell**.

- the natural environment is a set of filled arcs around the site
- missing conditions are open gaps in the shell
- facility modules orbit the site as small engraved plates
- moving a module into a gap closes it and changes the plan
- gravity, pressure and radiation remain explicitly facility-only

The user sees what Earth provides and what the facility must provide, spatially.

### 06 / Campaign synthesis

The climax.

- the planet pulls back
- a campaign ribbon rises from the surface
- three sites connect through elegant spatial arcs
- experiments and windows are engraved along the ribbon
- a timeline ribbon at the bottom assembles day by day
- travel legs, cost and readiness appear as measurements, not cards
- the final route locks into place with one continuous motion

This is the moment the plan becomes an expedition.

---

## 7. Visual language

### Palette

- Deep space: `#020304`, `#06080a`
- Lunar regolith: `#d7cfc0`, `#b8ad9d`
- Warm ivory: `#f1e9dd`
- Solar amber: `#d5a05a`
- Oxidized copper: `#8a5a3f`
- Ice blue: `#a8c7cc`
- No saturated cyan. No neon. No purple.

The current bright cyan accent is removed. Data is ice blue; active states are warm ivory; warnings are oxidized amber.

### Typography

- **Monumental titles:** a high-contrast serif, engraved and wide. Working candidate: *Instrument Serif* (open source).
- **Instrumentation:** a technical mono, small and precise.
- **No all-caps micro-labels everywhere.** Labels are sparse, engraved, and legible.
- Data uses tabular numerals.

This single change moves the interface away from SaaS instantly.

### Materials and light

- The planet is lit by one sun. No decorative rim lights.
- Glass appears only where information must sit above the planet.
- Hairlines are 1px, warm, and often incomplete.
- Glow is reserved for the atmosphere, the sun and the active route. Nothing else.
- Film grain and a subtle lens vignette unify the image.

### Motion

- Camera moves are splines, not cuts.
- Everything settles; nothing bounces.
- Data appears by being **drawn**: lines extend, arcs form, labels etch in.
- Time moves at a human pace, never faster than the eye can follow.
- The operation ring rotates only when the camera moves.

---

## 8. Rendering plan

### Earth

- 8K day and night albedo
- normal and specular maps
- separate cloud layer with soft shadows
- atmospheric scattering shader, physically plausible, not a neon rim
- city lights on the night side
- real NASA/Solar System Scope imagery, credited

### Terrain and descent

The current procedural terrain walk is removed.

Two acceptable paths, in order of preference:

1. **Real terrain reconstruction**
   - public DEM tiles (Mapzen Terrarium / NASA SRTM)
   - high-resolution satellite imagery (NASA GIBS, Esri World Imagery with attribution)
   - a real mesh around the site, draped with imagery
   - physically credible sun and atmospheric fog
   - label: "satellite-derived terrain / real DEM"

2. **Cinematic orbital descent**
   - if real terrain is unavailable, descend through high-resolution satellite imagery to a low aerial view
   - no fake ground-level 3D
   - label: "no ground-level imagery available"

A beautiful real satellite descent is better than a mediocre procedural world.

### Data layers

Only real data:

- ML score and uncertainty
- thermal, aridity, terrain, geology, dust, access
- live weather and seismic hazard
- Macrostrat unit
- facility-only gaps

No invented measurements, no fake satellite observations.

---

## 9. What is removed

- the 440px right panel
- the icon rail
- the top navigation bar
- metric grids and stat cards
- boxed inputs and buttons
- the REV label and build badges
- the cyan neon accent
- the current procedural 3D walkthrough
- decorative scan rings and orbit rings that do not carry information

---

## 10. Implementation sequence

1. **Structural pass**
   - remove the right panel, rail and top bar
   - add the Orbital Ring and operation title
   - build the site lens
   - move Explore data into the lens and site orbit

2. **Discovery and temporal pass**
   - candidate spine
   - scan wave
   - temporal ring and seasonal terminator

3. **Intervention pass**
   - condition shell and facility plates

4. **Campaign pass**
   - campaign ribbon and timeline

5. **Rendering pass**
   - Earth atmosphere, clouds and city lights
   - real DEM terrain descent

6. **Polish**
   - typography, palette, motion, sound

---

## 11. Success test

A first-time user should:

- understand that the planet is the interface within ten seconds
- find a site and understand why it was selected without opening a panel
- see time change the planet, not a chart
- understand what Earth cannot provide
- watch the campaign assemble as a coherent expedition

And at no point should the screen resemble a dashboard with a globe background.

---

## 12. Mission decomposition / Milestone 03

The mission structure extends the discovery spine instead of introducing a workflow
dashboard. The left surface is a typographic **mission tree**: mission, experiments,
formal requirements, assumptions and unresolved evidence. The right surface is an
**experiment-site matrix** in the same engraved register as the site legend, not a
card stack. Both are spatial instruments: selecting an experiment highlights its
candidate sites on the globe; selecting a requirement highlights the sites that pass
it and dims the rest; selecting a site returns to the orbital lens and preserves that
identity through DIVE, site orbit and return.

The tree and matrix do not replace the planet. They expose the reasoning behind the
planet markers. Requirement detail is the only place where provenance, units, dates,
measured/derived/reanalysis/mapped/missing evidence and point-versus-spatial support
are stated in full. The evidence matrix shows coverage and missing evidence rather
than inventing a single confident score.

The design rejects:
- a progress stepper or workflow wizard
- metric cards
- a site table detached from the globe
- a single opaque mission score that hides missing data
- ML ranking presented as scientific validation

The ML surrogate remains visible as context. The mission ranking is requirement
evidence. The two can disagree; the interface says so.

---

## 13. Temporal intelligence / Milestone 04

Time is represented spatially, not as a calendar. A translucent ring around the
Earth carries the twelve months as engraved positions; a solar marker and the
selected window arc sit on the same ring. The terminator responds to the selected
month through a real solar declination. Candidate sites are highlighted only when
their monthly climatology supports the active experiment in the selected month.

The left instrument panel carries the experiment choice, duration, fixed start and
the selected site's window evidence. The right panel is a temporal response spine,
not a dashboard: each row is a site, a window, a feasibility state and an evidence
coverage. The ring and the globe are the primary temporal surfaces; the month strip
and readouts are supporting instruments.

The visual must never imply a forecast. Every temporal surface states NASA POWER
monthly climatology 2001–2020 and repeats that monthly normals suppress daily
extremes.

---

## 14. Environmental interventions / Milestone 05

The condition shell is a two-ring scientific diagram around the selected site:

- the **inner ring** is the natural site condition;
- the **outer ring** is what a controlled intervention can add.

A measurement-only intervention appears as a measurement tick, not a filled
environmental condition. A partial or simulation-only intervention leaves a dashed
residual arc. A truly unmatched condition remains open. The natural inner ring never
changes when an intervention is selected: the site itself has not become another
planet.

The left spine is the requirement-gap list. The right spine is the intervention
evidence: what it reproduces, what it cannot, equipment and infrastructure classes,
constraints, complexity, confidence and assumptions. The language is qualitative;
no costs, availability or performance are invented.

---

## 15. Campaign synthesis / Milestone 06

The campaign view pulls the planet back into a route composition. Selected stops
are connected by great-circle arcs; the camera frames the centroid of the route so
the expedition is visible as a whole. A campaign ribbon carries the months and
stops in lanes; the detailed stop panel carries experiments, windows, controlled
conditions, field measurements, equipment, dependencies and residual conditions.

The ribbon is a schedule, but not the primary experience. The primary experience is
the planet, the arcs and the emerging expedition. The optimizer's objective and
constraints are exposed, and three lexicographic alternatives make the trade-off
between science, logistics and interventions explicit. A campaign with residual
gaps is still labelled as such.

## 16. Readability

The final visual system abandons micro-type for essential information. The scale is
12 px minimum, 14–18 px body, 20–28 px measurements and 32–48 px headings. The
instrument character comes from hairlines, serif names, mono metadata, restrained
colour and spatial anchoring, not from illegible labels. Panels scroll, the lens
keeps a sticky action foot, and the mobile surfaces become readable sheets rather
than shrunken desktop panels.
