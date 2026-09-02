# `src/domain/theme/` — terrain and names → identity

**Belongs here:** turning facts about cells into names and piece identities. Pure: no mapdata, no three.js.

| File                 | Responsibility                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`           | `CellFacts` (input), `CellIdentity`, `PieceIdentity`, `BoardTheme` (output).                                                                                                                                                                    |
| `wordlists.ts`       | Religious and horse/cattle stems; vocabulary for generated names; whole-word `hasStem`.                                                                                                                                                         |
| `nameCells.ts`       | The fallback chain: old_name → historic → name → nearby ("Below Ashberry Hill") → generated ("High Moor"); uniqueness pass.                                                                                                                     |
| `assignPieces.ts`    | Per colour, from its own half: king/queen ← settlements, rooks ← summits/ridges/headlands/highest, knights ← fords/passes/names, bishops ← churches/holy names/historic, pawns ← the rest. Two-pass so fallbacks never steal primaries (D-031). |
| `buildBoardTheme.ts` | `CellFacts[] → BoardTheme`.                                                                                                                                                                                                                     |

**Fed by** `mapdata/theme/buildCellFacts.ts`. **Consumed by** `game/ThemeTracker.ts` (identities follow pieces) and `ui/IdentityCard.ts` (the reveal on selection).

**Hard rule:** a board must never render with a blank cell, and every one of the 32 pieces must get an identity from a distinct cell in its own half — even with zero OSM data. `tests/domain/theme/theme.test.ts` checks this on an empty board and on all three fixtures.
