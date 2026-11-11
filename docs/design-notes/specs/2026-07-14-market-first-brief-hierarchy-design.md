# Market-First Brief Hierarchy Design

## Objective

Restore the Crypto Daily Brief's familiar market-first reading order without weakening the validated PDB v3 analysis or changing the live data and generation pipeline.

The page should let a reader answer three questions in sequence:

1. Where are BTC, ETH, and LINK trading now?
2. What is the bottom-line assessment?
3. What evidence, scenarios, and indicators support that assessment?

## Selected Approach

Use a direct hierarchy change rather than introducing a compact ticker or collapsing the executive analysis.

The desktop and mobile reading order will be:

1. Masthead, generation time, and refresh control
2. Market Summary with BTC, ETH, and LINK prices
3. Bottom Line
4. Key Judgments
5. Asset Assessments
6. Macro and Cross-Asset Regime
7. Scenario Outlook
8. Threats and Opportunities
9. Forward Watch
10. Intelligence Gaps
11. Source annex

This is the lowest-risk option because it changes presentation order only. Market fetching, news fetching, cached briefs, Gemini generation, PDB validation, and source evidence remain unchanged.

## Alternatives Considered

### Compact ticker above the Bottom Line

This would save vertical space but remove market cap, volume, support, and resistance from the first scan. It would also introduce a second market presentation or require a larger redesign.

### Collapsed executive analysis below prices

This would shorten the initial page but hide the product's most important intelligence. It also adds interaction state and accessibility work without solving a demonstrated problem.

### Direct reorder — selected

The existing full Market Summary moves above the executive section. It preserves familiarity, keeps all current data visible, and has the smallest regression surface.

## Market Number Presentation

Market card support and resistance values must use a display-only level formatter aligned with the existing price-formatting conventions:

- BTC example: `$58,067` and `$64,471`
- ETH example: `$1,715.91` and `$1,810.74`
- LINK example: `$7.080` and `$8.145`

The formatter must accept numeric values and numeric strings, preserve an em dash for unavailable values, remove floating-point artifacts, and avoid changing the deterministic values used for validation.

Only display formatting changes. The raw values in the brief and evidence index remain untouched.

## Confidence Presentation

Confidence describes the strength of the evidence behind an assessment. It does not describe whether the assessment is bullish or bearish, and it is not a numerical probability.

Display confidence prominently only where it helps a decision:

- Bottom Line
- Key Judgments
- Base, bullish, and bearish scenarios

Continue retaining confidence in the brief data and validation contract for every analytical object, but do not show repeated confidence badges on asset drivers, macro transmission channels, threats, opportunities, watch items, or intelligence gaps.

Add a compact, accessible disclosure near the Bottom Line labeled `How to read confidence` with this meaning:

- **High:** Multiple reliable and independent facts or signals align.
- **Medium:** Credible evidence supports the assessment, but material uncertainty or mixed signals remain.
- **Low:** Evidence is limited, indirect, or conflicting.

The disclosure must explicitly state that confidence is evidence strength, not market direction or certainty.

Confidence colors must remain informational and avoid the existing bullish/bearish implication: high uses blue, medium uses gold, and low uses muted gray. Confidence colors must not be described as buy, hold, or sell signals.

## Content Length

The validated 1,500–2,200-word PDB target remains unchanged in this phase. The successful local brief demonstrated that the depth is useful, but some repetition may be removed in a later prompt-tuning phase after several briefs are reviewed.

This phase will improve scanability through hierarchy and reduced badge repetition rather than modify Gemini instructions. That separation avoids mixing a safe layout correction with a higher-risk content-generation change.

## Rendering and Data Flow

The existing `renderV3Brief` flow remains responsible for populating the market cards and analysis sections.

- Move the Market Summary before the executive section in document order.
- Keep the legacy renderer compatible with the same Market Summary.
- Add one display-only formatter for support and resistance values.
- Add a confidence disclosure renderer or static accessible markup.
- Add an option to suppress confidence display in supporting-item rendering while retaining evidence links.

No network request, cache key, Worker route, API payload, schema, or validation rule changes are included.

## Error Handling and Accessibility

- Unavailable or nonnumeric support/resistance values render as `—`.
- The confidence explanation uses native disclosure semantics or an equivalently keyboard-accessible control.
- Existing loading, stale-cache fallback, refresh, evidence-link navigation, and source-annex behavior remain unchanged.
- Mobile order must match desktop order without horizontal overflow.

## Verification

Automated checks will cover:

- Market Summary appears before the Bottom Line and Key Judgments in document order.
- Support/resistance display formatting removes floating-point artifacts and preserves unavailable values.
- Confidence help text defines high, medium, and low and states that confidence is not market direction.
- Supporting items no longer render repeated confidence badges.
- The existing frontend parser, refresh, PDB v3 renderer, legacy renderer, and evidence navigation tests continue to pass.

Browser verification will cover:

- Desktop and mobile first-screen hierarchy
- BTC, ETH, and LINK card formatting
- Bottom Line and Key Judgment readability
- Confidence disclosure keyboard and click behavior
- No browser errors or horizontal overflow
- Cached brief loads without another Gemini request

## Release Boundary

Implement and verify this change only on the isolated `codex/pdb-v3-phase-a` branch. Do not push or deploy it until the local desktop and mobile review is approved.
