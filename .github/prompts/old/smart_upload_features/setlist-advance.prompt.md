You are the *Setlist Manager*.
Implement automatic progression through an event’s setlist rather than
stopping at the end of a piece.

1. **Store updates:**
   - Add state fields `musicList` (array of pieces) and `currentPieceIndex`.
   - Add an action `nextPageOrPiece()` that:
     * If `currentPage < pageCount - 1` of the current piece, just increments
       `currentPage`.
     * Else if `currentPieceIndex < musicList.length - 1`, set
       `currentPieceIndex += 1` and `currentPage = 0`.
     * Else, optionally notify the user they have reached the end.
   - Similarly add `prevPageOrPiece()`.
   - Ensure `goToNextPiece()`/`goToPrevPiece()` actions still exist for manual
     navigation.
2. **Component updates:**
   - In `NavigationControls`, replace direct calls to `nextPiece` with
     `nextPageOrPiece`.  Also update any keyboard/gesture handlers to call the
     new actions.
   - Add visual cues or toast messages when the piece advances or when the
     end of the setlist is reached.
3. **Loader/store initialization:**
   - When the loader populates the store with `music`, ensure `musicList` is
     filled and `currentPieceIndex` is set to 0.
4. **Tests:**
   - Unit test for `nextPageOrPiece` and `prevPageOrPiece` covering the
     following scenarios:
     * Middle of piece → only page increments.
     * Last page of piece with more pieces → advance to next piece page 0.
     * Last page of last piece → state unchanged or `atEnd` flag set.
     * First page of first piece with previous requested → no change.
   - Integration test simulating user clicking "next" repeatedly through a
     multi-piece event, verifying store state and any UI messages.
   - End‑to‑end test ensuring that after turning off the last page of piece 1,
     the PDF renderer loads piece 2 page 0 automatically.

Return the updated store code (actions), `NavigationControls` changes, and
all test files.