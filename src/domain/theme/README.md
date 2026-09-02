# `src/domain/theme/` — terrain and names → identity

**Belongs here:** scoring cells and features to assign piece identity (rook = highest cell, bishop = religious/historic name, knight = crossing or pass, king/queen = the two most significant settlements, pawns = the rest) and the display-name fallback chain:

`old_name` → `historic` name → `name` → nearest natural feature → generated name from terrain type.

**Does not belong here:** rendering labels, fetching OSM data. This layer receives already-normalised `MapFeature[]` and a finished `IBoardLayout` and returns identities.

**Hard rule:** a board must never render with a blank cell. The fallback chain is built alongside the happy path, not after.

**Built in:** Phase 10.
