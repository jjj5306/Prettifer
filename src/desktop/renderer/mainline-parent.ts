/**
 * How a merge's mainline parent is named on screen.
 *
 * Git records a merge's parents in order and the first one is the branch the
 * merge was made onto, so the position carries the whole meaning. The position
 * on its own is also the part a reader cannot interpret, which is why no screen
 * shows the number: the commit history offers the choice by side, and the result
 * reports back by side.
 */
export function mainlineParentSide(parentNumber: number): string {
  return parentNumber === 1 ? "mainline" : "merged-in";
}
