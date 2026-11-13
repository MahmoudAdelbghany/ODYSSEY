# ODYSSEY: Intervention Methodology

Earth cannot reproduce reduced gravity, the lunar vacuum, the thin CO₂ Martian
atmosphere or the space radiation environment. ODYSSEY treats each such gap as a
design problem and keeps four things strictly separate:

| Kind | Meaning | Example |
|---|---|---|
| Natural analog condition | Provided by the site; comes from measured/derived data | Atacama hyper-aridity |
| **PROPOSED CONTROLLED CONDITION** | A setpoint or protocol for a controlled test | Thermal cycle schedule 77–250 K |
| **SIMULATED** | Output of an explicit, documented physical model within its validity range | Radiative equilibrium of a coated plate under 1361 W/m² |
| **CONCEPT ONLY** | No model or verified capability backs a number | Accelerator irradiation; vacuum below 0.1 Pa in the ideal pump-down model |

Synthetic values are never written into an environmental profile and never
labelled as observations (asserted by `science.test.ts`).

## When an intervention is proposed

`find_intervention_options` proposes interventions for conditions that matter
for the experiment **and** are either Earth-wide gaps or classified as not
naturally reproducible. Conditions without a template are recorded as unresolved.

## Intervention record (PART 5.2)

Every option carries: id, target gap (dimension), experiment, base capability
(`src/interventions` catalogue id), equipment, control variables with target
ranges and the source of each target, instrumentation, facility requirements,
power, safety constraints, feasibility class, cost, setup time, calibration,
what it reproduces, what it cannot reproduce, limitations, references and a
verification status. **Power, cost and setup time are always `null` with the
note "not estimated"**, ODYSSEY has no verified facility data and does not invent
it. Facility availability and performance are always marked UNVERIFIED.

## Models (`server/science/interventions.ts`)

| Model | Equation | Validity / limits | Label |
|---|---|---|---|
| `vacuum_pumpdown_ideal` | t = (V/S)·ln(p₀/p) | Viscous flow only. Below 0.1 Pa outgassing dominates: no time is reported, label becomes CONCEPT ONLY. The lunar 3×10⁻¹⁰ Pa is explicitly not modelled. | SIMULATED / CONCEPT ONLY |
| `radiative_equilibrium_plate` | T = (α·G·cosθ/(ε·σ) + T_shroud⁴)^¼ | Thin isothermal plate in vacuum, black shroud, no conduction, steady state. Sizing estimate, not an article prediction. σ = 5.670374419×10⁻⁸ W m⁻² K⁻⁴. | SIMULATED |
| `gravity_offload_statics` | F = m·(g₀ − g_target), g₀ = 9.80665 m/s² | Exact for static weight. Soil still carries Earth-gravity overburden, so traction/slip results stay biased; suspension dynamics are residual. | SIMULATED |
| `thermal_cycle_protocol` | Ramp/dwell setpoint schedule | Setpoints only; article temperatures must be measured. The cold setpoint is bounded by the shroud (e.g. 77 K LN₂), so a 50 K lunar extreme is reported as NOT reproduced. | PROPOSED CONTROLLED CONDITION |

Engineering inputs not supplied by the user (article mass, chamber volume, pump
speed, coating α/ε, ramp rate) use labelled defaults; every default is listed in
the evaluation (`defaults[]`) and in the exported report.

## Intervention Lab

The Lab (agent stage → *Intervention lab*) lets a user change the controllable
variables and re-runs the model on the server (`POST /api/interventions/simulate`).
It always shows the label, equation, validity, warnings, assumptions, what the
intervention reproduces and what it cannot, and the residual gap.

## Template coverage

| Gap | Options |
|---|---|
| Surface pressure (vacuum / low pressure) | Thermal-vacuum chamber test |
| Atmospheric composition (Mars CO₂) | Low-pressure CO₂ chamber |
| Surface temperature envelope / night | Programmed thermal cycling in vacuum |
| Darkness duration | Full-duration night soak |
| Gravity | Suspension/counterweight offload (SIMULATED); parabolic flight (CONCEPT) |
| Radiation dose | Accelerator irradiation (CONCEPT; no transport model) |
| Aeolian vs non-aeolian dust | Dust chamber without airflow |
| Regolith grain size | Characterised simulant bed |
| Mineralogy | Laboratory mineralogy (measurement-only; closes an evidence gap) |
