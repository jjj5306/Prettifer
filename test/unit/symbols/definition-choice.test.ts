import { describe, expect, it } from "vitest";

import {
  preferredDeclarations,
  usageAt,
} from "../../../src/symbols/definition-choice.js";
import type { DeclarationKind } from "../../../src/symbols/declarations.js";

function hit(kind: DeclarationKind | null, line: number) {
  return { kind, line };
}

describe("preferredDeclarations", () => {
  it("prefers the type over its constructors for a plain use", () => {
    const found = [hit("constructor", 8), hit("type", 3), hit("constructor", 12)];

    expect(preferredDeclarations(found, "plain")).toEqual([hit("type", 3)]);
  });

  it("prefers the constructors where an object is being made", () => {
    const found = [hit("constructor", 8), hit("type", 3), hit("constructor", 12)];

    // Overloads are a real choice, so both stay.
    expect(preferredDeclarations(found, "construction"))
      .toEqual([hit("constructor", 8), hit("constructor", 12)]);
  });

  it("falls back to the type when the constructor is implicit", () => {
    const found = [hit("type", 3), hit(null, 20)];

    expect(preferredDeclarations(found, "construction")).toEqual([hit("type", 3)]);
  });

  it("drops local variables once a method of that name exists", () => {
    const found = [hit("variable", 40), hit("method", 12), hit("variable", 91)];

    expect(preferredDeclarations(found, "plain")).toEqual([hit("method", 12)]);
  });

  it("keeps local variables when nothing else declares the name", () => {
    const found = [hit("variable", 40), hit(null, 12)];

    expect(preferredDeclarations(found, "plain")).toEqual([hit("variable", 40)]);
  });

  it("offers nothing when no line declares the symbol", () => {
    expect(preferredDeclarations([hit(null, 1), hit(null, 2)], "plain")).toEqual([]);
  });
});

describe("usageAt", () => {
  it.each([
    ["        UtVar counter = new UtVar();", 29, "construction"],
    ["        return new UtVar(seed);", 20, "construction"],
    ["        return new  UtVar(seed);", 21, "construction"],
    // The declaration of the type itself, not a construction.
    ["        UtVar counter = new UtVar();", 9, "plain"],
    ["public class UtVar {", 14, "plain"],
    ["        return counter.total();", 24, "plain"],
    // `renew` ends in `new` but is one word.
    ["        return renewUtVar();", 16, "plain"],
  ] as const)("%s at %i is %s", (line, column, expected) => {
    expect(usageAt(line, column)).toBe(expected);
  });

  it("treats a column at the start of the line as a plain use", () => {
    expect(usageAt("new UtVar();", 1)).toBe("plain");
  });
});
