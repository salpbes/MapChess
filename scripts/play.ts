// WHAT: Play chess in the terminal against yourself, using only the domain layer.
// HOW:  A readline loop over a ChessEngine. Accepts SAN ("Nf3", "O-O", "e8=Q")
//       or coordinate moves ("e2e4", "e7e8q"), plus a few commands. Draws the
//       board as ASCII from `pieces()`.
// WHY:  BUILD_PLAN Phase 2 "done when": a full game can be played from the
//       console with no renderer attached. If this script ever needs three.js
//       or the DOM to run, the layering has leaked.
//
// Run: npm run play

import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';

import { FILES, RANKS } from '@domain/board/Square';
import type { Square } from '@domain/board/Square';
import { ChessEngine } from '@domain/chess/ChessEngine';
import { IllegalMoveError } from '@domain/chess/errors';
import type { IChessEngine } from '@domain/chess/IChessEngine';
import type { MoveRequest, PieceType, PromotionPiece } from '@domain/chess/types';

const LETTER: Readonly<Record<PieceType, string>> = {
  pawn: 'p',
  knight: 'n',
  bishop: 'b',
  rook: 'r',
  queen: 'q',
  king: 'k',
};

const PROMOTION_LETTER: Readonly<Record<string, PromotionPiece>> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

function renderBoard(engine: IChessEngine): string {
  const lines: string[] = [];
  for (const rank of [...RANKS].reverse()) {
    const cells = FILES.map((file) => {
      const piece = engine.pieceAt(`${file}${rank}`);
      if (piece === null) return '.';
      const letter = LETTER[piece.type];
      return piece.color === 'white' ? letter.toUpperCase() : letter;
    });
    lines.push(`${rank}  ${cells.join(' ')}`);
  }
  lines.push('');
  lines.push(`   ${FILES.join(' ')}`);
  return lines.join('\n');
}

function describeStatus(engine: IChessEngine): string {
  const s = engine.status;
  switch (s.kind) {
    case 'checkmate':
      return `Checkmate — ${s.winner} wins.`;
    case 'draw':
      return `Draw by ${s.reason.replace(/-/g, ' ')}.`;
    case 'playing':
      return `${engine.turn === 'white' ? 'White' : 'Black'} to move${s.inCheck ? ' — check!' : ''}.`;
  }
}

/** "e2e4" / "e7e8q" → MoveRequest; anything else → null. */
function parseCoordinate(input: string): MoveRequest | null {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(input);
  if (m === null) return null;
  const from = m[1]?.toLowerCase() as Square;
  const to = m[2]?.toLowerCase() as Square;
  const promoLetter = m[3]?.toLowerCase();
  const promotion = promoLetter === undefined ? undefined : PROMOTION_LETTER[promoLetter];
  return promotion === undefined ? { from, to } : { from, to, promotion };
}

function resolveInput(engine: IChessEngine, input: string): MoveRequest | null {
  const bySan = engine.legalMoves().find((m) => m.san === input);
  if (bySan !== undefined) {
    return bySan.promotion === null
      ? { from: bySan.from, to: bySan.to }
      : { from: bySan.from, to: bySan.to, promotion: bySan.promotion };
  }
  return parseCoordinate(input);
}

const HELP = [
  'Enter a move as SAN (Nf3, exd5, O-O, e8=Q) or coordinates (e2e4, e7e8q).',
  'Commands: moves  undo  fen  history  reset  help  quit',
].join('\n');

async function main(): Promise<void> {
  const engine: IChessEngine = new ChessEngine();
  const rl = createInterface({ input: stdin, output: stdout, prompt: '> ' });

  const show = (): void => {
    stdout.write(`\n${renderBoard(engine)}\n\n${describeStatus(engine)}\n`);
  };

  stdout.write(`MapChess — console play\n${HELP}\n`);
  show();
  rl.prompt();

  // The async iterator buffers lines, so piped input works as well as a terminal.
  for await (const line of rl) {
    const raw = line.trim();
    if (raw === '') {
      rl.prompt();
      continue;
    }

    let handled = true;
    switch (raw.toLowerCase()) {
      case 'quit':
      case 'exit':
        rl.close();
        return;
      case 'help':
        stdout.write(`${HELP}\n`);
        break;
      case 'moves':
        stdout.write(
          `${
            engine
              .legalMoves()
              .map((m) => m.san)
              .join(' ') || '(none)'
          }\n`,
        );
        break;
      case 'fen':
        stdout.write(`${engine.fen}\n`);
        break;
      case 'history':
        stdout.write(`${engine.history.map((m) => m.san).join(' ') || '(no moves yet)'}\n`);
        break;
      case 'undo': {
        const undone = engine.undo();
        stdout.write(undone === null ? 'Nothing to undo.\n' : `Took back ${undone.san}.\n`);
        show();
        break;
      }
      case 'reset':
        engine.reset();
        show();
        break;
      default:
        handled = false;
    }
    if (handled) {
      rl.prompt();
      continue;
    }

    const request = resolveInput(engine, raw);
    if (request === null) {
      stdout.write(`Did not understand "${raw}". Type "help".\n`);
      rl.prompt();
      continue;
    }

    try {
      const played = engine.move(request);
      stdout.write(`Played ${played.san}.\n`);
      show();
      if (engine.status.kind !== 'playing') {
        stdout.write('Game over. Type "undo" to take back, "reset" for a new game, or "quit".\n');
      }
    } catch (error: unknown) {
      if (!(error instanceof IllegalMoveError)) throw error;
      stdout.write(`Illegal: ${error.reason.replace(/-/g, ' ')}.\n`);
    }
    rl.prompt();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
