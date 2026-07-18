# Homeowner design-to-permit marketplace strategy

Decision date: 2026-07-18

## Product thesis

The homeowner is the primary user. The product is a useful, high-intent marketing funnel that helps a homeowner turn an idea into a feasible, visually compelling, permit-coordinated deck project—and then introduces the project to suitable local builders.

It is not a contractor operating system and not a one-time picture generator. The durable value is a portable **project brief** containing the verified site, chosen design, selections, budget range, professional/permit status and construction documents. The homeowner owns that brief and can share it with builders.

```text
inspiration -> address/property -> measured house/site -> design options
            -> budget/feasibility -> chosen design -> professional/permit package
            -> matched local builders -> quotes/build
```

The product earns trust by being useful before asking for contact details or sending a lead.

## Customer

The homeowner typically has:

- an address and an aspiration, but no site plan or construction vocabulary;
- inspiration photos, desired uses and a rough budget;
- uncertainty about what fits, what is legal, what materials cost and whether a permit is needed;
- difficulty comparing builders because every quote may assume a different scope;
- no desire to learn general CAD or manage structural calculations.

The product translates between homeowner intent, architectural geometry, professional review, municipal requirements and builder scope.

## Homeowner journey

### 1. Inspire without pretending to design

Use real project categories and product/assembly examples:

- ground-level, raised, multi-level and second-storey decks;
- entertaining, dining, hot-tub, pool, accessibility and privacy needs;
- cedar, treated wood, composite and waterproof membranes;
- aluminum, wood, glass and cable guard systems;
- stairs/landings, lighting, privacy screens, pergolas and patio covers.

The gallery is an intent collector. A saved image should become structured preferences such as “picture-frame composite decking, black aluminum guard, two levels,” not a fake geometry choice.

### 2. Establish the actual property

- normalize the civic address and retrieve parcel/zoning/permit context;
- show the real house/lot reference clearly and explain its evidence quality;
- guide the homeowner to measure the relevant wall, doors, grades and obstacles using photos and exact dimensions;
- optionally accept survey/as-built files or a professional/site-visit verification.

The project remains a concept until construction-critical facts are verified.

### 3. Design the outdoor space

- show a simple 2D plan of the house wall, openings, property constraints and terrain;
- draw arbitrary deck platforms around the house;
- assign different platform elevations;
- click between platforms or terrain to add calculated stairs and landings;
- select edge behavior: attached wall, open edge, guard, shared edge or stair opening;
- choose materials/railings/lighting from real systems;
- use 3D only as a derived client preview after the plan is located and dimensioned.

The agent can propose alternatives around goals and constraints, but every change appears in the editable plan.

### 4. Compare viable options

Show two or three alternatives with consistent scope:

- plan and attractive preview;
- usable area and key dimensions;
- major materials/assemblies;
- preliminary structural approach and unresolved risks;
- permit/professional requirements;
- budget range with explicit assumptions;
- trade-offs such as more footings versus ledger attachment, glass guard cost, stair footprint or waterproofing.

This is where the marketing value and technical product reinforce each other: the homeowner gets confidence, and the eventual builder receives a serious, qualified project.

### 5. Produce design and permit documents

- automatically generate the site, floor/deck, framing/foundation, elevation, section, detail and calculation sheets;
- obtain field/survey/professional evidence where required;
- route unsupported design items to a qualified designer/engineer;
- complete the current municipal application and owner authorization;
- package, validate and submit through the supported municipal channel;
- track comments, fees, revisions and approval.

The product can automate coordination and submission, but cannot promise approval or a professional seal.

### 6. Suggest and introduce builders

After the homeowner has meaningful scope, suggest a small ranked set of relevant builders. Match on:

- service area and travel radius;
- project type, size, height and complexity;
- material/railing/waterproofing/pergola specialties;
- permit and professional-coordination capability;
- relevant manufacturer credentials;
- verified business identity, applicable licences, insurance and safety status;
- current availability, response rate, review quality and comparable completed projects;
- homeowner priorities such as budget, design quality or schedule.

The homeowner chooses what to share and with whom. A builder receives a standardized lead package rather than a name and phone number:

- homeowner-approved contact and preferred communication;
- address sharing level and site constraints;
- selected design revision and option history;
- plans, measurements, photos and evidence status;
- material/finish selections;
- budget/timing range;
- permit/professional status and outstanding work;
- explicit quote scope and exclusions.

This lets builders quote the same project and reduces wasted site visits and scope ambiguity.

## Marketplace trust rules

- Do not sell or transmit contact/project data before explicit homeowner consent.
- Show why each builder matched.
- Separate organic fit ranking from paid placement; label sponsorship clearly.
- Verify credentials from authoritative or manufacturer sources and show verification dates.
- Do not turn review stars alone into a safety or quality guarantee.
- Let homeowners invite a builder they already know and export their project freely.
- Limit introductions so the homeowner is not spammed and builders receive serious opportunities.
- Record builder access and revoke it when the homeowner withdraws consent.

## Builder side

The builder experience is deliberately small:

- public profile, service area, specialties, credentials and example projects;
- lead preferences and capacity/availability;
- accept/decline a matched project;
- view the shared project brief and ask structured clarification questions;
- submit a comparable quote with alternates, exclusions and schedule;
- optionally take over permit/build coordination with owner authorization.

Do not build full CRM, accounting, crew scheduling or procurement first. Integrate those later if builders request them.

## Revenue model

Possible revenue streams can coexist only when trust remains explicit:

- homeowner fee for a professional-review/permit package;
- builder subscription for profile, matching preferences and qualified project access;
- fee for an owner-consented accepted lead or successful introduction;
- clearly labelled manufacturer sponsorship/product placement;
- professional/survey/site-capture services with transparent pricing.

Never make the generated design artificially dependent on a paying builder or material brand. The project brief remains exportable.

## Competitive position

| Product category | Useful capability | Missing link |
| --- | --- | --- |
| [Trex Deck Designer](https://www.trex.com/build-your-deck/planyourdeck/deck-designer/) | Inspiration, materials, 3D, budget, shopping list, basic blueprint and builder directory | Primarily a branded consumer funnel; constrained geometry and limited site/professional/municipal coordination |
| [Simpson Strong-Tie Deck Planner](https://www.strongtie.com/products/go/software/deckplanner) | 2D/3D design, connectors, permit pages and bill of materials | Manufacturer-oriented planner rather than verified local site-to-permit-to-builder workflow |
| [Chief Architect](https://www.chiefarchitect.com/support/category/226/decks.html) | Mature multi-level architectural design, stairs, framing, drawings and CAD exchange | Desktop professional authoring; too complex for homeowners, no structural load calculations, municipal agent or builder marketplace |
| Builder directories/lead marketplaces | Discover and contact local companies | Leads usually arrive before scope, design, permit risk and quote basis are clear |

The differentiator is not another directory. It is matching builders to a homeowner-owned, permit-coordinated and construction-specific project.

## Product structure

Use five homeowner-facing stages, with the plan available whenever geometry exists:

1. **Idea** — goals, inspiration, budget and desired materials/features.
2. **Property** — address, house/site capture, zoning and evidence.
3. **Design** — multi-platform plan, elevations, stairs, selections and derived preview.
4. **Permit** — framing/checks, drawings, professional review, application and approval status.
5. **Builders** — matched companies, consented sharing, questions and comparable quotes.

The agent is a guide and operator within these stages. The UI should never expose the current internal eight-step wizard or ask the homeowner to understand joist/post state before the design is spatially coherent.

## Pilot

The first market test should serve homeowners in one municipal cluster and recruit a small, curated builder network.

Success means:

- homeowners can create varied, correctly located multi-platform concepts without CAD training;
- the project collects the measurements and evidence a professional/builder actually needs;
- the generated package materially reduces professional drafting and permit coordination work;
- at least three local builders say the shared lead package is good enough to price or determine the one required site visit;
- homeowners understand why suggested builders fit and consent to each introduction;
- revisions remain coordinated across design, documents and quote scope.

