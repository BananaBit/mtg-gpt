# Deck Analysis and Optimization Evolution Plan

Status: Draft for follow-up implementation  
Depends on: `SERVERLESS_FUNCTION_CONSOLIDATION_PLAN.md`  
Primary services: `analyze-service.js` and `optimize-service.js`  
Primary consumers: Custom GPT Actions `analyzeDeck` and `optimizeDeck`

## 1. Purpose

Evolve deck analysis from basic structural statistics into evidence-based strategic diagnostics, and evolve deck optimization from an empty placeholder into ranked, collection-aware replacement recommendations.

This work completes the deck-focused portion of the product goal:

> Parse a user-provided decklist, evaluate its structure, mana, roles, interactions, consistency, and likely weaknesses; compare it with the stored collection; identify missing cards; and suggest explainable replacements, prioritizing cards the user owns.

## 2. Relationship to Serverless Consolidation

This specification must not add a Vercel Serverless Function.

After consolidation, both operations remain inside `api/decks-router.js`:

| Public path | Operation ID | Service |
|---|---|---|
| `POST /api/decks/analyze` | `analyzeDeck` | `lib/decks/analyze-service.js` |
| `POST /api/decks/optimize` | `optimizeDeck` | `lib/decks/optimize-service.js` |

The public paths, HTTP methods, operation IDs, Bearer authentication, and `x-openai-isConsequential: false` behavior must remain unchanged.

The serverless consolidation may be implemented before this specification. This work should be performed after the consolidated routing tests pass so infrastructure and analysis regressions remain distinguishable.

## 3. Current Behavior

### 3.1 Current `analyzeDeck`

The existing service returns:

- Parsed deck size.
- Color identity.
- Mana-value buckets.
- Land count.
- Card-type distribution.
- Unresolved cards.
- Unparsed input lines.
- Optional collection coverage.

It does not currently return:

- Weighted average mana value.
- Colored mana demand or available sources.
- Card roles.
- Interaction density.
- Synergy or tension evidence.
- Game-plan or archetype signals.
- Format warnings.
- Consistency diagnostics.
- Compact resolved card facts for GPT explanation.

### 3.2 Current `optimizeDeck`

The existing service delegates to `analyzeDeck`, then returns empty `suggested_additions` and `suggested_removals` arrays with a warning that a candidate pool is required.

It does not currently:

- Build a candidate pool from the active collection.
- Reserve owned quantities already committed to the deck.
- Match missing cards to owned replacements.
- Score candidates by role, mana value, type, color, legality, or synergy.
- Explain why a candidate was selected.
- Identify evidence-based cuts or structural corrections.

## 4. Goals

1. Produce useful structural, mana, role, interaction, and consistency diagnostics for normal Constructed and Commander-size decklists.
2. Return enough verified card evidence for the Custom GPT to explain the analysis without retrieving every card separately.
3. Distinguish deterministic facts from heuristic conclusions.
4. Validate common format constraints when a format is supplied.
5. Build replacement candidates from active owned cards.
6. Rank replacements using deterministic, explainable scoring.
7. Never recommend more owned copies than are available after accounting for cards already used by the deck.
8. Preserve all current request fields and backward-compatible response fields.
9. Keep Action responses comfortably below the Custom GPT payload limit.
10. Complete requests with headroom below the Custom GPT timeout.
11. Avoid claiming measured win rates, objective card power, or guaranteed performance.

## 5. Non-Goals

- A complete Magic rules engine.
- Exhaustive Comprehensive Rules interaction proof.
- Matchup-specific win-rate prediction without matchup and game data.
- Monte Carlo game simulation or automated playtesting.
- Price-aware purchasing or marketplace recommendations.
- Automatic mutation of the stored collection.
- Automatic mutation or persistence of a user's decklist.
- Global card discovery across every legal Magic card in the first implementation phase.
- A guarantee that a suggested replacement is strategically equivalent.
- Exact Commander bracket or power-level scoring.
- Tournament registration or authoritative deck certification.

## 6. Design Principles

### 6.1 Facts and heuristics must be separate

Every output category must be identifiable as one of:

- `fact`: directly computed from parsed quantities or canonical card data.
- `rule_check`: deterministic validation against supported format constraints.
- `heuristic`: a reproducible diagnostic based on documented thresholds or scores.
- `incomplete`: a conclusion limited by unresolved cards or unavailable data.

The API must return raw structured data. The Custom GPT is responsible for turning those facts into natural-language coaching.

### 6.2 Recommendations must be explainable

Every suggested cut, addition, or replacement must include:

- The relevant card names and verified identifiers.
- Owned and available quantities when collection-based.
- A numeric score with named components.
- Machine-readable reason codes.
- Evidence such as shared roles, mana-value distance, type overlap, or synergy tags.
- Limitations or tradeoffs.

### 6.3 Analysis must degrade gracefully

Unresolved cards must not invalidate analysis of resolved cards. The response must state coverage and suppress conclusions whose required evidence is incomplete.

### 6.4 Compactness is a feature

The service should perform expensive classification and interaction work server-side and return compact evidence. It must not depend on the GPT making one Action call per card.

## 7. Custom GPT Action Constraints

Design and tests must enforce these current platform constraints:

- Complete the full round trip within 45 seconds.
- Keep request and response payloads below 100,000 characters.
- Return text-based JSON only.
- Preserve a single Bearer authentication scheme.
- Keep the existing read-only POST operations marked `x-openai-isConsequential: false`.

Internal engineering targets must be stricter than the platform maximum:

| Constraint | Internal target |
|---|---:|
| Service execution | 35 seconds or less |
| Serialized response | 80,000 characters or less |
| Interaction records | At most 40 |
| Recommendation records | At most 20 unless a smaller request limit applies |
| Candidate cards scored deeply | At most 200 unique cards |

When an optional section would exceed the response budget, omit or compact that section, set `response_truncated: true`, and add a warning that identifies the omitted section. Never silently return invalid JSON or truncate a string at the transport layer.

## 8. Input Contracts

### 8.1 Analyze request

Preserve the existing request:

```json
{
  "decklist": "string",
  "format": "commander",
  "include_collection": true
}
```

Rules:

- `decklist` remains required.
- `format` remains optional.
- `include_collection` defaults to `false`.
- Unknown format values produce a warning rather than fabricated validation.
- Input limits must reject unreasonably large decklists before canonical resolution.

### 8.2 Optimize request

Preserve the existing request:

```json
{
  "decklist": "string",
  "format": "commander",
  "constraints": {
    "owned_only": true,
    "maximum_additions": 10,
    "preserve_theme": true
  }
}
```

Rules:

- `decklist` remains required.
- `format` remains optional.
- `constraints.owned_only` defaults to `false` for backward compatibility.
- `constraints.maximum_additions` defaults to 10 and is capped at 20.
- `constraints.preserve_theme` defaults to `true`.
- The first implementation guarantees collection-derived additions when `owned_only=true`.
- When `owned_only=false`, owned candidates may still be returned and labeled `source=collection`; unrestricted global card discovery is not required by this phase.

No `oneOf`, union types, or conditional request schemas should be introduced into `schema.yaml`.

## 9. Canonical Card Resolution Evolution

The shared `resolveCards` implementation now deduplicates identifiers and uses bounded Scryfall collection batches, including exact-name resolution for name-only decklists. Further resolver evolution must preserve that behavior while completing the requirements below.

Implement a reusable canonical resolver with:

1. Name, Scryfall ID, and printing identifier normalization.
2. Deduplication before remote lookup.
3. Redis reuse when canonical records are already available.
4. Batched provider requests where the provider supports them.
5. Bounded concurrency for remaining requests.
6. A per-request cache so the analyze and optimize phases never resolve the same card twice.
7. Stable mapping back to deck sections and quantities.
8. Per-card resolution status instead of all-or-nothing failure.
9. A deadline check that stops optional enrichment before the Action timeout.

The resolver must return canonical fields needed by analysis:

- `scryfall_id`
- `oracle_id`
- `name`
- `scryfall_uri`
- `mana_cost`
- `cmc`
- `type_line`
- `oracle_text`
- `colors`
- `color_identity`
- `keywords`
- `produced_mana`, when available
- `legalities`
- card faces for modal or double-faced cards

Tests must use fixtures and mocks rather than live Scryfall requests.

## 10. `analyzeDeck` Evolution

### 10.1 Pipeline

Implement analysis in this order:

1. Parse sections and quantities.
2. Validate input size and basic section structure.
3. Resolve unique canonical cards.
4. Normalize multi-face card facts.
5. Compute structural and mana facts.
6. Classify card roles and synergy tags.
7. Compute theme, interaction, and tension signals.
8. Run supported format checks.
9. Compute heuristic diagnostics.
10. Optionally compute collection coverage.
11. Compact the response to the configured payload budget.

### 10.2 Backward compatibility

Preserve these existing top-level fields:

- `format`
- `deck_size`
- `color_identity`
- `mana_curve`
- `land_count`
- `type_distribution`
- `unresolved_cards`
- `unparsed_lines`
- `collection_coverage`, when requested

Add `analysis_version` so future scoring changes are observable.

### 10.3 Structural analysis

Return:

- Counts by deck section.
- Unique card count.
- Nonland card count.
- Weighted average mana value, excluding lands by default.
- Median mana value.
- Mana curve with both quantities and percentages.
- Permanent versus nonpermanent counts.
- Counts by primary type and relevant subtypes.
- Number of modal double-faced cards and other modal cards when detectable.
- Unresolved quantity as well as unresolved names.
- Resolution coverage percentage.

Quantities must be respected in every weighted statistic.

### 10.4 Mana analysis

Return separate facts for demand and supply.

#### Demand

- Colored mana symbols in cast costs, weighted by quantity.
- Pip distribution by color.
- Cards with intense color requirements.
- Curve by color when useful.
- Generic and colorless requirements.

#### Supply

- Land count.
- Known colored sources using canonical produced-mana data and conservative Oracle-text rules.
- Nonland mana sources.
- Ramp count by estimated timing when detectable.
- Fixing sources.
- Untapped-versus-conditional source signals only when deterministically detectable.

#### Diagnostics

- Low or high land-count signals relative to deck size and curve.
- Color-demand versus source-count imbalance.
- Expensive curve without sufficient ramp.
- Excessive concentration at specific mana values.
- Missing early plays when supported by the curve and role data.

Mana diagnostics are heuristic and must report their thresholds and evidence. They must not claim exact cast probabilities unless a documented probability calculation is implemented and tested.

### 10.5 Role classification

Create a deterministic classifier under `lib/decks/analysis/`.

Minimum roles:

- `land`
- `mana_source`
- `ramp`
- `card_draw`
- `card_selection`
- `targeted_removal`
- `board_wipe`
- `counterspell`
- `discard`
- `protection`
- `combat_trick`
- `tutor`
- `recursion`
- `graveyard_enabler`
- `token_producer`
- `sacrifice_outlet`
- `life_gain`
- `life_payoff`
- `counter_producer`
- `counter_payoff`
- `threat`
- `finisher`
- `combo_enabler`

A card may have multiple roles. Each classification must contain:

- Role code.
- Confidence: `high`, `medium`, or `low`.
- Evidence field and matcher code.
- Whether the role is repeatable or one-shot when detectable.

Role classifiers must be conservative. False negatives are preferable to invented roles.

### 10.6 Synergy tags

Minimum synergy tags:

- artifacts
- enchantments
- creatures
- instants-and-sorceries
- tokens
- sacrifice
- graveyard
- reanimation
- counters
- lifegain
- typal, with detected creature types
- lands
- landfall
- blink
- spellslinger
- equipment
- auras
- legends
- historic
- modified
- proliferate

Tags must distinguish producers, consumers, enablers, and payoffs where applicable.

### 10.7 Interaction analysis

Generate a bounded list of evidence-based relationships:

```json
{
  "kind": "synergy",
  "cards": ["Card A", "Card B"],
  "reason_codes": ["TOKEN_PRODUCER_WITH_SACRIFICE_PAYOFF"],
  "shared_tags": ["tokens", "sacrifice"],
  "confidence": "high"
}
```

Supported relationship kinds:

- `synergy`
- `dependency`
- `redundancy`
- `tension`
- `possible_combo`

Requirements:

- Relationships must be grounded in canonical card text and classifier evidence.
- `possible_combo` must never be labeled as deterministic or infinite unless all required steps are represented and supported by explicit matchers.
- Return the highest-value relationships first.
- Cap the list at 40.
- Return aggregate interaction density separately from individual examples.

### 10.8 Game-plan and theme signals

Return structured signals rather than a prose deck guide:

- Dominant synergy tags.
- Primary and secondary archetype labels with confidence.
- Likely setup, development, and closing-role counts.
- Detected win-condition categories.
- Theme concentration score.
- Cards weakly connected to the dominant themes.

The Custom GPT should turn these signals into a user-facing description of the game plan.

### 10.9 Format checks

When `format` is provided and recognized, return:

- Scryfall legality conflicts.
- Deck-size warnings.
- Sideboard-size warnings for supported formats.
- Copy-count warnings where applicable.
- Commander singleton warnings, excluding basic lands.
- Commander section and color-identity warnings when commander information is available.

Requirements:

- Use canonical legality fields as the source of truth for card legality.
- Clearly label the validator as limited rather than tournament-authoritative.
- Unknown or unsupported formats return `validation_status=unsupported`, not a guessed result.
- The supplied format must not merely be echoed without validation.

### 10.10 Performance diagnostics

The term performance refers to heuristic deck construction quality, not predicted win rate.

Return diagnostics for:

- Curve balance.
- Mana consistency.
- Threat density.
- Interaction density.
- Card-advantage density.
- Ramp density.
- Protection and resilience.
- Redundancy around major themes.
- Win-condition support.
- Dependency bottlenecks.
- Dead or unsupported synergy pieces.

Each diagnostic must contain:

```json
{
  "code": "LOW_INTERACTION_DENSITY",
  "severity": "warning",
  "classification": "heuristic",
  "observed": 3,
  "expected_range": { "min": 6, "max": null },
  "evidence_cards": ["Example Card"],
  "confidence": "medium"
}
```

Thresholds must be centralized in a versioned configuration module, not scattered across the service.

### 10.11 Compact card facts

Return one compact record per resolved unique card, subject to the payload budget:

- Name and quantity by section.
- Scryfall ID and URL.
- Mana cost and mana value.
- Type line.
- Oracle text when it fits within the response budget.
- Color identity.
- Relevant legality value for the requested format.
- Classified roles and synergy tags.

If Oracle text must be omitted to respect the payload budget, retain identifiers, roles, tags, and URLs, then list omitted card names in response metadata. The GPT may call `getCardDetails` for a small number of cards requiring deeper explanation.

## 11. Proposed Analyze Response

The exact schema may evolve during implementation, but it must follow this structure:

```json
{
  "analysis_version": "2.0",
  "format": "commander",
  "deck_size": 100,
  "color_identity": ["G", "U"],
  "mana_curve": {},
  "land_count": 37,
  "type_distribution": {},
  "unresolved_cards": [],
  "unparsed_lines": [],
  "resolution": {
    "unique_requested": 64,
    "unique_resolved": 64,
    "coverage_percent": 100
  },
  "structure": {},
  "mana": {
    "average_mana_value": 3.1,
    "demand": {},
    "sources": {},
    "diagnostics": []
  },
  "roles": {
    "counts": {},
    "cards": {}
  },
  "themes": [],
  "interactions": [],
  "format_validation": {},
  "performance_diagnostics": [],
  "card_facts": [],
  "collection_coverage": {},
  "response_truncated": false,
  "warnings": []
}
```

Do not add verbose natural-language essays to this response.

## 12. `optimizeDeck` Evolution

### 12.1 Pipeline

Implement optimization in this order:

1. Run the evolved analysis once and reuse its resolved canonical records.
2. Compute collection coverage.
3. Identify unavailable, partially available, illegal, structurally weak, or weakly connected cards as replacement targets.
4. Load and aggregate the active collection candidate pool.
5. Reserve quantities already committed to the submitted deck.
6. Resolve canonical facts for candidate cards using the shared resolver and request cache.
7. Apply hard eligibility filters.
8. Score candidates against each replacement target and the whole-deck needs.
9. Allocate owned quantities across recommendations without double-counting.
10. Return ranked, evidence-based suggestions and remaining gaps.

The optimizer must not call `analyzeDeck` in a way that forces canonical cards to be resolved twice.

### 12.2 Collection candidate repository

Add a repository method that returns active owned cards aggregated for recommendations.

Each candidate must include:

- Card name.
- Scryfall ID when available.
- Total owned quantity.
- Quantity already required by the submitted deck.
- Quantity available for an addition.
- Printing records and locations.

Candidate aggregation should normally use Oracle identity or normalized card name so multiple printings do not become duplicate strategic candidates. Printing details remain available for ownership reporting.

Archived rows and zero-quantity candidates must never be included.

### 12.3 Hard eligibility filters

Before scoring, exclude candidates that:

- Have no available owned copy when `owned_only=true`.
- Are unresolved.
- Conflict with a recognized requested format.
- Violate Commander color identity when it can be determined.
- Violate singleton or copy limits after considering current deck contents.
- Are the same card as the replacement target unless the user is missing only additional copies and copies are legal.
- Are explicitly incompatible with a required card type or role when the target is marked critical.

Unknown legality is a warning, not automatic approval.

### 12.4 Scoring model

Candidate scores must be deterministic and decomposed into named components.

Initial scoring components:

| Component | Purpose |
|---|---|
| `role_overlap` | Preserves the target card's functional roles |
| `deck_need` | Improves a diagnosed deficiency such as removal or draw |
| `synergy_fit` | Matches dominant deck tags and producer/payoff relationships |
| `type_overlap` | Preserves relevant card and permanent types |
| `mana_value_fit` | Avoids unintended curve changes |
| `color_fit` | Fits identity and colored-source availability |
| `format_fit` | Rewards known legal candidates |
| `theme_preservation` | Applies when `preserve_theme=true` |
| `availability` | Rewards sufficient owned copies without double-counting |
| `tension_penalty` | Penalizes conflicts found by interaction analysis |

Weights must live in a versioned configuration file. A recommendation must expose the weighted component scores and final normalized score.

Do not use market price as a proxy for power.

### 12.5 Replacement targets

Prioritize targets in this order:

1. Cards missing from the collection when an owned replacement is requested.
2. Cards illegal for the requested format.
3. Cards that violate color identity or copy limits.
4. Cards identified as unsupported synergy pieces.
5. Curve or role-density outliers supported by diagnostics.

Missing cards are not automatically bad cards. The response must distinguish `unavailable` from `recommended_cut`.

### 12.6 Quantity allocation

The optimizer must maintain a request-scoped allocation ledger:

```text
available = total active owned copies - copies already used in the submitted deck - copies allocated to earlier recommendations
```

Requirements:

- Never recommend negative availability.
- Never allocate one physical copy to multiple simultaneous recommendations.
- Respect printing-specific requirements only when the caller explicitly requires printing matches.
- Report when a candidate is a partial-quantity replacement.

### 12.7 Suggested additions

Each addition must contain:

```json
{
  "card": {
    "name": "Candidate Card",
    "scryfall_id": "uuid",
    "scryfall_uri": "https://scryfall.com/card/..."
  },
  "source": "collection",
  "owned": 2,
  "available_for_addition": 1,
  "recommended_quantity": 1,
  "locations": ["Black Binder"],
  "score": 0.84,
  "score_components": {},
  "reason_codes": ["ROLE_MATCH", "CURVE_MATCH", "OWNED_COPY_AVAILABLE"],
  "roles": ["targeted_removal"],
  "tradeoffs": ["SORCERY_SPEED_INSTEAD_OF_INSTANT"]
}
```

### 12.8 Suggested removals and replacements

Return separate concepts:

- `replacement_targets`: cards needing alternatives because of availability, legality, or explicit diagnostics.
- `suggested_removals`: heuristic cuts supported by deck-level evidence.
- `replacement_pairs`: target-to-candidate mappings.

Each pair must state whether it is:

- `functional_substitute`
- `structural_correction`
- `collection_available_alternative`
- `partial_substitute`

Do not describe two cards as equivalent when their roles or timing materially differ.

### 12.9 No-candidate behavior

When no eligible owned candidate exists:

- Return the target in `unresolved_replacement_needs`.
- Include the roles, types, mana range, and synergy tags that a future candidate should satisfy.
- Do not invent a card.
- Do not silently relax `owned_only=true`.

## 13. Proposed Optimize Response

```json
{
  "optimization_version": "2.0",
  "constraints": {
    "owned_only": true,
    "maximum_additions": 10,
    "preserve_theme": true
  },
  "diagnostics": {},
  "collection_summary": {
    "coverage_percent": 82.5,
    "missing_copies": 7,
    "eligible_unique_candidates": 140
  },
  "replacement_targets": [],
  "replacement_pairs": [],
  "suggested_additions": [],
  "suggested_removals": [],
  "unresolved_replacement_needs": [],
  "allocation_summary": {},
  "response_truncated": false,
  "warnings": []
}
```

Preserve the existing top-level `suggested_additions`, `suggested_removals`, `diagnostics`, and `warnings` fields for backward compatibility.

## 14. Suggested Module Structure

```text
lib/decks/
├── analyze-service.js
├── optimize-service.js
├── decklist-parser.js
├── analysis/
│   ├── canonical-card-normalizer.js
│   ├── structural-analysis.js
│   ├── mana-analysis.js
│   ├── role-classifier.js
│   ├── synergy-classifier.js
│   ├── interaction-analysis.js
│   ├── format-validator.js
│   ├── performance-diagnostics.js
│   ├── response-budget.js
│   └── analysis-config.js
└── optimization/
    ├── candidate-pool.js
    ├── eligibility.js
    ├── candidate-scorer.js
    ├── allocation-ledger.js
    └── optimization-config.js
```

This structure is illustrative but the separation of deterministic analysis, scoring configuration, and orchestration is required.

Shared card-resolution improvements belong under `lib/cards/`, not inside an API entry point.

## 15. Error and Warning Behavior

Preserve existing HTTP behavior where practical:

- Invalid or empty decklist: 400 with `INVALID_DECKLIST`.
- Authentication failure: 401.
- Unexpected internal failure: structured error without secrets.

Use warnings for partial but useful results:

- Unresolved cards.
- Unsupported format validation.
- Incomplete canonical fields.
- Candidate pool capped.
- Optional response sections omitted for budget.
- Deadline approaching and optional analysis skipped.
- No eligible owned replacement.

Warnings must use stable codes in addition to short messages.

## 16. Privacy and Security

- Do not log complete decklists by default.
- Do not log collection locations or quantities in production request logs.
- Never include Supabase service credentials or Action keys in responses.
- Continue using the server-side Supabase client for collection access.
- All optimization behavior remains read-only.
- Do not expose the complete collection when only aggregated candidates or recommendations are required.

## 17. Schema and GPT Instruction Updates

### `schema.yaml`

- Preserve operation IDs and paths.
- Keep request schemas simple and explicit.
- Do not add detailed response object schemas that risk Custom GPT importer failures.
- Update descriptions only if needed, keeping them within Action description limits.
- Keep `components.schemas` as an explicit object.
- Preserve the single Bearer security scheme.

### `gpt/instructions.md`

Add only concise behavioral guidance:

- Use `analyzeDeck` for structural, mana, interaction, format, and performance diagnostics.
- Use `optimizeDeck` for evidence-based cuts and collection-aware replacement candidates.
- Describe performance findings as heuristics, not guaranteed results.
- Explain recommendation tradeoffs and ownership limitations.

After editing, report the final character count and keep the file below the Custom GPT editor limit.

## 18. Test Strategy

### 18.1 Unit tests

Add deterministic tests for:

- Weighted curve and average mana value.
- Multi-face card normalization.
- Colored pip parsing.
- Mana-source classification.
- Every minimum role classifier.
- Producer and payoff synergy tags.
- Interaction, tension, and redundancy matchers.
- Format legality and copy-count warnings.
- Diagnostic threshold boundaries.
- Candidate eligibility filters.
- Every score component.
- Allocation ledger quantity safety.
- Response-budget compaction.

### 18.2 Service tests

Test `analyzeDeck` with mocked canonical cards for:

- A normal 60-card deck.
- A Commander deck with a commander section.
- Sideboard and companion sections.
- Partial resolution failure.
- An unsupported format.
- Collection coverage enabled and disabled.
- A response large enough to trigger safe compaction.

Test `optimizeDeck` for:

- Fully owned decks.
- Missing cards with strong owned substitutes.
- Missing cards with no eligible substitute.
- Multiple targets competing for one owned copy.
- Color-identity and legality exclusions.
- `preserve_theme` changing score components.
- `maximum_additions` enforcement.
- No duplicate canonical resolution between analysis and optimization.

### 18.3 Golden fixtures

Create small, reviewable card fixtures representing:

- Aggro curve and low-cost threats.
- Control interaction and card advantage.
- Graveyard enablers and recursion payoffs.
- Token production and sacrifice payoffs.
- Typal enablers and payoffs.
- Conflicting graveyard-exile effects.
- Commander color-identity violations.

Golden tests must assert reason codes and evidence, not long prose strings.

### 18.4 Performance tests

Using mocked provider latency and collection data:

- Analyze a 100-card singleton deck within the internal service target.
- Optimize against at least 400 owned collection rows within the internal service target.
- Confirm bounded concurrency.
- Confirm candidate caps.
- Confirm serialized responses remain below 80,000 characters.

No performance test may depend on live Scryfall or Supabase.

### 18.5 Production smoke tests

After deployment:

1. Analyze a small deck and verify application JSON rather than Vercel `NOT_FOUND`.
2. Analyze a Commander-size deck and confirm completion below the Action timeout.
3. Request collection coverage and confirm stored ownership is represented.
4. Optimize a deck with a known missing card and known owned substitute.
5. Confirm no suggested quantity exceeds collection availability.
6. Invoke both operations through Custom GPT Preview.
7. Confirm the GPT describes diagnostics as heuristic and links only verified cards.

## 19. Acceptance Criteria

### Analyze service

- [ ] Existing response fields remain available.
- [ ] Structural statistics respect card quantities and sections.
- [ ] Mana demand and conservative source analysis are returned.
- [ ] Minimum roles and synergy tags are classified with evidence.
- [ ] Interaction and tension records are bounded and evidence-based.
- [ ] Recognized formats receive limited legality and construction checks.
- [ ] Performance diagnostics are labeled heuristic.
- [ ] Compact verified card facts are available to the GPT.
- [ ] Partial card-resolution failures produce useful partial analysis.
- [ ] Commander-scale responses remain within the internal payload budget.

### Optimize service

- [ ] Suggested additions are no longer always empty.
- [ ] Active owned cards can form the candidate pool.
- [ ] Already-used and already-allocated quantities are reserved.
- [ ] Hard format and color filters run before scoring.
- [ ] Scores expose named components and stable reason codes.
- [ ] Replacement pairs distinguish functional similarity from structural correction.
- [ ] No recommendation exceeds available owned quantity.
- [ ] Missing candidates produce structured unresolved needs rather than invented cards.
- [ ] Existing top-level response fields remain available.

### Platform compatibility

- [ ] No new Vercel Function is added.
- [ ] `analyzeDeck` and `optimizeDeck` operation IDs remain unchanged.
- [ ] Both calls complete below the internal time target in performance tests.
- [ ] Both responses remain below the internal payload target.
- [ ] `schema.yaml` remains accepted by the Custom GPT editor.
- [ ] `gpt/instructions.md` remains within its editor limit.
- [ ] Custom GPT Preview successfully calls and explains both operations.

## 20. Implementation Sequence

Implement in vertical slices:

### Phase 1: Resolution and facts

1. Add canonical card fixtures.
2. Replace sequential resolution with deduplicated, cached, bounded resolution.
3. Add structural and mana-value analysis.
4. Add compact card facts and response budgeting.

### Phase 2: Roles and interactions

5. Add role classifier and tests.
6. Add synergy tags and tests.
7. Add bounded interaction and tension analysis.
8. Add game-plan signals.

### Phase 3: Validation and diagnostics

9. Add supported format checks.
10. Add versioned diagnostic thresholds.
11. Add evidence-based performance diagnostics.
12. Complete the evolved `analyzeDeck` response.

### Phase 4: Collection-aware optimization

13. Add aggregated recommendation candidates to the collection repository.
14. Add eligibility filters.
15. Add deterministic scoring and versioned weights.
16. Add the allocation ledger.
17. Add replacement targets, pairs, additions, removals, and unresolved needs.
18. Complete the evolved `optimizeDeck` response.

### Phase 5: Integration

19. Update minimal schema descriptions if needed.
20. Update compact GPT instructions.
21. Run unit, service, performance, and regression tests.
22. Deploy without increasing the consolidated function count.
23. Run production and Custom GPT smoke tests.

Do not begin heuristic recommendation scoring before canonical resolution, role classification, and ownership allocation are covered by tests.

## 21. Risks and Mitigations

### Provider latency

Risk: Resolving many unique cards exceeds the Action timeout.  
Mitigation: Deduplicate, cache, batch, use bounded concurrency, and enforce an internal deadline.

### Oversized responses

Risk: Commander card facts exceed the Action payload limit.  
Mitigation: Use an 80,000-character budget, cap optional records, and omit Oracle text before core facts.

### False strategic certainty

Risk: Heuristic output is presented as objective deck strength.  
Mitigation: Label classifications, expose evidence and thresholds, and instruct the GPT to explain uncertainty.

### Weak text classification

Risk: Regex-driven roles miss unusual templating or produce false positives.  
Mitigation: Conservative matchers, confidence levels, fixtures, and versioned classifier rules.

### Duplicate ownership allocation

Risk: One physical card is recommended for several replacements.  
Mitigation: Use a request-scoped allocation ledger and test competing targets.

### Format validation overreach

Risk: The service claims tournament-authoritative legality.  
Mitigation: Scope supported checks, return unsupported states, and label validation limitations.

### Recommendation bias

Risk: Scoring favors superficially similar text over actual deck needs.  
Mitigation: Separate target similarity from deck-level deficiency scores and expose component weights.

## 22. Rollback Plan

The response evolution is additive. If production behavior regresses:

1. Retain the consolidated router deployment.
2. Revert `analyze-service.js` and `optimize-service.js` to their prior implementations.
3. Preserve the existing request schemas and operation IDs.
4. Remove only instruction text that depends on unavailable evolved fields.
5. Redeploy and verify the basic curve, type, collection coverage, and placeholder optimization behavior.

Do not roll back by restoring additional API entry points.

## 23. Future Extensions

Possible later work, outside this implementation:

- User-supplied candidate pools.
- Non-owned global Scryfall candidate discovery.
- Budget and price constraints.
- Matchup-specific sideboard analysis.
- Goldfish or draw-probability simulations.
- Persisted deck versions and optimization history.
- User-configurable role and threshold profiles.
- Curated format- or archetype-specific scoring profiles.

Any future extension must preserve evidence-based output, payload budgeting, and the consolidated function-count constraint.
