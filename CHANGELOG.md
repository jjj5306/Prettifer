# Changelog

Written for the people who download Prettifer, so each entry says what changed on
screen rather than which module moved. The `Publish release` workflow copies the
section of the version it builds into the release notes, so a missing section
fails the release.

## v0.3.0

### Added

- Symbol navigation in the review. `Ctrl+Click` or `F12` goes to a declaration,
  `Shift+F12` lists every reference, and `Back` returns to where you were. Java,
  C/C++, TypeScript and JavaScript are covered.
- The whole repository is searched, not only the files your selection changed.
  A declaration in a file the selection never touched opens at the comparison
  base, marked as being outside the selected result.
- Declarations are told apart by what they are — type, constructor, method,
  field, variable, alias or macro — and the list says which is which. Pointing at
  `new UtVar(...)` prefers the constructors; pointing anywhere else prefers the
  type declaration.
- Holding `Ctrl` underlines the identifier under the pointer, so you can see what
  a click would follow.
- The diff can be read side by side or inline. The toggle sits in the review
  heading, and switching keeps your place in the file.
- Java and C/C++ now get syntax highlighting.
- The review heading names the file you are looking at, which matters once
  navigation moves you between files.

### Fixed

- Starting a symbol lookup no longer scrolls the diff back to the top.
- Going to a declaration puts the cursor on the symbol itself and marks the line
  it arrived at, instead of stopping at the start of the line.

## v0.2.0

### Added

- A repository path can be passed on the command line, so Prettifer opens that
  repository instead of asking for a folder.

### Fixed

- In Tree View each row is only as wide as its own name, so widening the panel
  shows the hierarchy as an outline instead of a stack of full-width bars.

## v0.1.0

First Windows release. Select commits that are not next to each other, review the
composed file state and one unified diff, and keep your working tree, branch and
uncommitted work untouched throughout.
