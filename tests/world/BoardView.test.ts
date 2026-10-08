// WHAT: Tests for BoardView's move choreography against a resync mid-flight.
// HOW:  A real PieceLayer, MoveAnimator and HighlightLayer on a flat layout,
//       with plain Object3Ds for pieces. The animator is ticked by hand, so a
//       `showPosition` can be dropped in between take-off and landing.
// WHY:  The piece models finish downloading whenever they finish, and the
//       board is rebuilt from the engine the moment they do. When that landed
//       during a move's flight, the move's own bookkeeping then found its
//       piece already re-filed under the destination and threw — so the move
//       was in the engine but never reached the record or the turn. A fast
//       first move on a GPU machine hit it every time.

import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';

import { FlatBoardLayout } from '@domain/board/FlatBoardLayout';
import { ChessEngine } from '@domain/chess/ChessEngine';
import { BoardView } from '@world/pieces/BoardView';
import { HighlightLayer } from '@world/pieces/HighlightLayer';
import { MoveAnimator } from '@world/pieces/MoveAnimator';
import { PieceLayer } from '@world/pieces/PieceLayer';

function setUp(fen?: string): {
  engine: ChessEngine;
  pieces: PieceLayer;
  animator: MoveAnimator;
  view: BoardView;
} {
  const layout = new FlatBoardLayout({ boardSizeMeters: 800 });
  const pieces = new PieceLayer(layout, {
    create: () => new Object3D(),
    dispose: () => undefined,
  });
  const animator = new MoveAnimator({ unit: 100 });
  const view = new BoardView(pieces, new HighlightLayer(layout), animator);
  const engine = new ChessEngine(fen);
  view.showPosition(engine.pieces());
  return { engine, pieces, animator, view };
}

describe('BoardView', () => {
  it('moves the piece and its bookkeeping when the flight lands', async () => {
    const { engine, pieces, animator, view } = setUp();
    const pawn = pieces.objectAt('e2');

    const landing = view.playMove(engine.move({ from: 'e2', to: 'e4' }));
    animator.update(1);
    await landing;

    expect(pieces.objectAt('e2')).toBeNull();
    expect(pieces.objectAt('e4')).toBe(pawn);
  });

  it('lets a resync during the flight stand, rather than throwing', async () => {
    const { engine, pieces, view } = setUp();

    const landing = view.playMove(engine.move({ from: 'e2', to: 'e4' }));
    // The new piece models arrive: the board is rebuilt from the engine.
    view.showPosition(engine.pieces());

    await expect(landing).resolves.toBeUndefined();
    expect(pieces.objectAt('e2')).toBeNull();
    expect(pieces.objectAt('e4')).not.toBeNull();
  });

  it('does not take a piece a second time after a resync during a capture', async () => {
    const { engine, pieces, view } = setUp(
      'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    );

    const landing = view.playMove(engine.move({ from: 'e4', to: 'd5' }));
    view.showPosition(engine.pieces());
    await landing;

    const capturer = pieces.objectAt('d5');
    expect(capturer).not.toBeNull();
    expect(capturer?.parent).toBe(pieces.group);
    expect(pieces.objectAt('e4')).toBeNull();
  });
});
