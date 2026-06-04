# Module Contract / 模块合同

## Generated Artifacts / 生成产物

| Artifact | Purpose | Owner |
|---|---|---|
| `analysis-bundle.json` | Full reusable analysis result: teams, RR/PRISM indicators, player-round facts, scoreboard, timeline, economy, heatmap, QA. | `@cs2dak/core` |
| `view-model.json` | UI-ready model for React or rewritten frontends. | `@cs2dak/presentation` |
| `qa-report.json` | Data quality status and actionable issues. | `@cs2dak/core` |

## Integration Rules / 集成规则

- Core packages must not import product code from RivalHub, CS2 Insight Agent, or future apps.
- `@rivalhub/rival-rating` is an allowed external dependency for RR/PRISM formulas and indicator types.
- React components consume presentation contracts; they do not query databases or run analysis logic.
- Python integration should consume JSON artifacts first. Rewriting algorithms in Python is optional and should be fixture-verified.
- Fixtures are the source of truth for cross-language behavior.

## Reference Use / 参考项目使用边界

- CS Demo Manager: match workspace structure, heatmap/economy/2D viewer UX references.
- AWPy: analytics rigor, map plotting, parser output vocabulary.
- CS2 2D Demo Viewer: replay frame/event model references.
- pr1maly: local-first product research only because the license is non-commercial.
