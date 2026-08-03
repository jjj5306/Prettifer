import { describe, expect, it } from "vitest";

import {
  declarationKindOf,
  type DeclarationKind,
} from "../../../src/symbols/declarations.js";

/**
 * Real Java idioms, kept as one list so a pattern change shows immediately what
 * it broke. `null` means the line declares nothing: it uses, calls or assigns.
 */
const JAVA: readonly [string, string, DeclarationKind | null][] = [
  // types
  ["public class UtVar {", "UtVar", "type"],
  ["public final class UtVar extends Base implements Runnable {", "UtVar", "type"],
  ["class UtVar {", "UtVar", "type"],
  ["public interface UtVar {", "UtVar", "type"],
  ["public enum UtVar { A, B }", "UtVar", "type"],
  ["public record UtVar(int seed) {", "UtVar", "type"],
  ["public @interface UtVar {", "UtVar", "type"],
  ["import model.UtVar;", "UtVar", null],
  ["package UtVar;", "UtVar", null],
  ["// UtVar is the counter", "UtVar", null],
  [" * @param UtVar the counter", "UtVar", null],

  // constructors, and the calls that look like them
  ["    public UtVar() {", "UtVar", "constructor"],
  ["    public UtVar(int seed) {", "UtVar", "constructor"],
  ["    UtVar(int seed) {", "UtVar", "constructor"],
  ["    private UtVar(int seed) throws IOException {", "UtVar", "constructor"],
  ["    @Inject public UtVar(Clock clock) {", "UtVar", "constructor"],
  ["        UtVar counter = new UtVar();", "UtVar", null],
  ["        return new UtVar(seed);", "UtVar", null],
  ["        this.value = new UtVar(seed).total();", "UtVar", null],
  ["        list.add(new UtVar());", "UtVar", null],

  // methods, and the calls that look like them
  ["    public int total() {", "total", "method"],
  ["    private static synchronized int total(int a, int b) {", "total", "method"],
  ["    int total();", "total", "method"],
  ["    public abstract int total();", "total", "method"],
  ["    @Override public int total() {", "total", "method"],
  ["    @Override", "total", null],
  ["    public <T extends Number> T total(List<T> values) {", "total", "method"],
  ["    public Map<String, List<Integer>> total() {", "total", "method"],
  ["    public int total() throws IOException {", "total", "method"],
  ["        return counter.total();", "total", null],
  ["        total();", "total", null],
  ["        int value = total() + 1;", "total", null],
  ["        if (total() > 0) {", "total", null],
  ["        return this.total();", "total", null],
  ["        return other.total() + total();", "total", null],
  ["        while (total() < 3) {", "total", null],

  // fields and variables
  ["    private String userCode;", "userCode", "field"],
  ["    public static final int userCode = 3;", "userCode", "field"],
  ["    private List<String> userCode = new ArrayList<>();", "userCode", "field"],
  ["    @Inject private UtVar userCode;", "userCode", "field"],
  ["    String userCode;", "userCode", "variable"],
  ["        int userCode = 3;", "userCode", "variable"],
  // `final` cannot tell a local apart from a field without scope analysis. Both
  // are declarations, and the two kinds differ only in how they rank.
  ["        final String userCode = name;", "userCode", "field"],
  ["        Map<String, Integer> userCode = new HashMap<>();", "userCode", "variable"],
  ["        userCode = 4;", "userCode", null],
  ["        this.userCode = 4;", "userCode", null],
  ["        return userCode;", "userCode", null],
  ["        if (userCode == 3) {", "userCode", null],
  ["        other.userCode = 4;", "userCode", null],
  ["        return userCode == other.userCode;", "userCode", null],

  // a name that appears only as a type or a parameter is not declared here
  ["    public void set(UtVar value) {", "UtVar", null],
  ["    private Map<String, UtVar> byName;", "UtVar", null],
  ["    public UtVar find(String name) {", "UtVar", null],
  ["        for (UtVar each : all) {", "UtVar", null],
];

describe("declarationKindOf for Java", () => {
  it.each(JAVA)("%s → %s is %s", (line, name, expected) => {
    expect(declarationKindOf("java", line, name)).toBe(expected);
  });

  it("tells a constructor apart from the type of the same name", () => {
    expect(declarationKindOf("java", "public class UtVar {", "UtVar")).toBe("type");
    expect(declarationKindOf("java", "    public UtVar() {", "UtVar")).toBe("constructor");
  });
});

describe("declarationKindOf for C and C++", () => {
  it.each([
    ["struct Node {", "Node", "type"],
    ["class Node : public Base {", "Node", "type"],
    ["enum Color { Red };", "Color", "type"],
    ["typedef int Handle;", "Handle", "alias"],
    ["using Handle = int;", "Handle", "alias"],
    ["#define MAX_ITEMS 10", "MAX_ITEMS", "macro"],
    ["  # define MAX_ITEMS 10", "MAX_ITEMS", "macro"],
    ["Node::Node(int seed) {", "Node", "constructor"],
    ["explicit Node(int seed);", "Node", "constructor"],
    ["Node::~Node() {", "Node", "constructor"],
    // An in-class `Node(int);` reads exactly like the call `total();`, so it is
    // missed rather than turning every call into a declaration. The class line
    // and the out-of-class definition are still found.
    ["    Node(int seed);", "Node", null],
    ["int total(int a, int b) {", "total", "method"],
    ["static int total(void);", "total", "method"],
    ["int Node::total() const {", "total", "method"],
    ["    return total(a, b);", "total", null],
    ["    total();", "total", null],
    ["int userCode = 3;", "userCode", "variable"],
    ["static const char* userCode;", "userCode", "variable"],
    ["    userCode = 4;", "userCode", null],
    ["    return userCode;", "userCode", null],
  ] as const)("%s → %s is %s", (line, name, expected) => {
    expect(declarationKindOf("cpp", line, name)).toBe(expected);
  });
});

describe("declarationKindOf for TypeScript", () => {
  it.each([
    ["export class Store {", "Store", "type"],
    ["interface Store {", "Store", "type"],
    ["export type Id = string;", "Id", "alias"],
    ["export function total(values: number[]): number {", "total", "method"],
    ["export const total = (a: number) => a;", "total", "variable"],
    ["  let userCode = 3;", "userCode", "variable"],
    ["  private readonly userCode: string;", "userCode", "field"],
    ["  total(values: number[]): number {", "total", "method"],
    ["    return this.total(values);", "total", null],
    ["    total(values);", "total", null],
    ["    userCode = 4;", "userCode", null],
    ["    return userCode;", "userCode", null],
  ] as const)("%s → %s is %s", (line, name, expected) => {
    expect(declarationKindOf("typescript", line, name)).toBe(expected);
  });
});
