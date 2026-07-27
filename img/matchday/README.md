# The matchday archive

Photographs of things that actually happened, filed by season and fixture.

    img/matchday/<season>/<date>-<opponent-slug>/<date>-<opponent-slug>-<nn>[-thumb].{jpg,webp}

    img/matchday/2026-27/2026-08-01-wallingford-and-crowmarsh/
        2026-08-01-wallingford-and-crowmarsh-01.jpg        1600px, site
        2026-08-01-wallingford-and-crowmarsh-01.webp       smaller, modern browsers
        2026-08-01-wallingford-and-crowmarsh-01-thumb.jpg  480px, grids
        2026-08-01-wallingford-and-crowmarsh-01-thumb.webp

Season runs 1 July to 30 June, so 2026-08-01 is season `2026-27`.

Written by `tools-archive-match.js`, which also adds the entries to
`data/gallery.json` with the fixture id and the photographer's name. Do not add
files here by hand — the naming is what makes the archive navigable without a
database, in ten years, by someone who has never seen this repo.

Standard: `docs/matchday-photography.md`. Why it exists: `THE-LANE.md`.

Graphics and illustrations do not belong here. This folder is photographs.
