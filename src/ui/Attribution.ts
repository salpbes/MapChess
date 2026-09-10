// WHAT: The credit line for the data the board is made of.
// HOW:  A small strip in the bottom-right corner, always on screen, with a
//       link per source and the full licence on hover.
// WHY:  Not decoration and not optional. OpenStreetMap's data is under the
//       ODbL, which requires the attribution to be visible wherever the data
//       is — a line in the README does not cover a running app, and this game
//       is nothing but that data. Stockfish is GPL-3.0 and is shipped compiled,
//       so the link goes to the source rather than to the project's front page:
//       what the licence asks for is that whoever has the binary can get the
//       code. The terrain tiles ask for credit too. Wikidata is CC0 and asks
//       for nothing; it is here because taking facts from a source without
//       naming it is poor manners even when it is legal.

interface Source {
  readonly text: string;
  readonly href: string;
  readonly detail: string;
}

const SOURCES: readonly Source[] = [
  {
    text: '© OpenStreetMap contributors',
    href: 'https://www.openstreetmap.org/copyright',
    detail:
      'Rivers, woods, peaks, place names and everything else on the board come from OpenStreetMap, under the Open Database Licence (ODbL).',
  },
  {
    text: 'Terrain: Mapzen / AWS',
    href: 'https://registry.opendata.aws/terrain-tiles/',
    detail:
      'Ground heights from Mapzen Terrain Tiles on AWS Open Data, themselves assembled from SRTM, NED and other public surveys.',
  },
  {
    text: 'Engine: Stockfish',
    href: 'https://github.com/official-stockfish/Stockfish',
    detail:
      'The opponent is Stockfish, running as WebAssembly in a worker. Licensed GPL-3.0; the link goes to the source, and the licence text ships beside the engine.',
  },
  {
    text: 'Facts: Wikidata',
    href: 'https://www.wikidata.org/',
    detail:
      'Founding dates and heritage listings from Wikidata, released into the public domain (CC0).',
  },
];

export class Attribution {
  private readonly root: HTMLDivElement;

  public constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'attribution';

    SOURCES.forEach((source, i) => {
      if (i > 0) {
        const dot = document.createElement('span');
        dot.className = 'attribution__dot';
        dot.textContent = '·';
        this.root.appendChild(dot);
      }
      const link = document.createElement('a');
      link.href = source.href;
      link.target = '_blank';
      // Never hand the opened page a handle on this one.
      link.rel = 'noopener noreferrer';
      link.textContent = source.text;
      link.dataset.tip = source.detail;
      this.root.appendChild(link);
    });

    container.appendChild(this.root);
  }

  public dispose(): void {
    this.root.remove();
  }
}
