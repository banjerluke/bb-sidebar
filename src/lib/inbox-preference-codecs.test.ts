// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  activeViewCodec,
  childExpansionCodec,
  projectCollapseCodec,
  projectScopeCodec,
  shelfExpansionCodec,
} from "./inbox-preference-codecs";
import { decodeStoredValue } from "./storage-codec";
import { STORAGE_KEYS } from "./storage-keys";

afterEach(() => localStorage.clear());

it("validates saved project selections and removes duplicate IDs", () => {
  expect(projectScopeCodec.decode('["b","a","b"]')).toEqual(["b", "a"]);
  expect(projectScopeCodec.decode("[]")).toEqual([]);
  for (const raw of [null, "invalid", "null", "{}", '["a",1]', '[""]', '[" "]']) {
    expect(decodeStoredValue(raw, projectScopeCodec)).toBeNull();
  }
});

it("retains permissive set filtering and the existing array formats", () => {
  for (const codec of [childExpansionCodec, projectCollapseCodec]) {
    const decoded = decodeStoredValue('["a", 1, "b", "a"]', codec)!;
    expect([...decoded]).toEqual(["a", "b"]);
    expect(codec.encode(decoded)).toBe('["a","b"]');
    for (const input of [null, "", "null", "{}", "invalid"]) expect(decodeStoredValue(input, codec)).toBeNull();
  }
});

it("caps child expansion before deduplication on read and only on storage prune", () => {
  const ids = ["old", ...Array.from({ length: 100 }, () => "new")];
  expect([...childExpansionCodec.decode(JSON.stringify(ids))!]).toEqual(["new"]);
  const live = new Set(Array.from({ length: 102 }, (_, i) => String(i)));
  expect(childExpansionCodec.prune!(live)).toEqual(new Set([...live].slice(-100)));
  expect(live.size).toBe(102);
});

it("fills older shelf shapes and drops unknown keys without stricter primitive rejection", () => {
  expect(shelfExpansionCodec.decode('{"settled":true,"unknown":true}')).toEqual({
    active: true,
    pinned: true,
    working: true,
    inactive: false,
    parked: false,
    snoozed: false,
    settled: true,
  });
  for (const value of [true, 1, [], "old"]) {
    expect(shelfExpansionCodec.decode(JSON.stringify(value))).toEqual(shelfExpansionCodec.fallback());
  }
  expect(shelfExpansionCodec.decode('{"active":0,"working":false,"inactive":"true"}')).toEqual({
    ...shelfExpansionCodec.fallback(),
    working: false,
  });
  expect(decodeStoredValue("null", shelfExpansionCodec)).toBeNull();
});

it("migrates the older sort mode and grouping without rewriting them", () => {
  localStorage.setItem(STORAGE_KEYS.activeGrouping.key, "true");
  expect(activeViewCodec.decode(null)).toEqual({ group: "project", order: "manual" });
  localStorage.setItem(STORAGE_KEYS.activeSort.key, "activity");
  expect(activeViewCodec.decode(null)).toEqual({ group: "none", order: "activity" });
  localStorage.setItem(STORAGE_KEYS.activeSort.key, "project");
  expect(activeViewCodec.decode(null)).toEqual({ group: "project", order: "manual" });
  expect(localStorage.getItem(STORAGE_KEYS.activeSort.key)).toBe("project");
  expect(localStorage.getItem(STORAGE_KEYS.activeGrouping.key)).toBe("true");
  localStorage.removeItem(STORAGE_KEYS.activeSort.key);
  localStorage.setItem(STORAGE_KEYS.activeGrouping.key, "false");
  expect(activeViewCodec.decode(null)).toEqual({ group: "none", order: "manual" });
});

it("round-trips every grouping and order and rejects invalid views", () => {
  for (const group of ["none", "project", "section"] as const) {
    for (const order of ["manual", "activity", "created"] as const) {
      expect(activeViewCodec.decode(activeViewCodec.encode({ group, order }))).toEqual({ group, order });
    }
  }
  expect(activeViewCodec.decode('{"group":"folder","order":"manual"}')).toBeNull();
  expect(activeViewCodec.decode('"project"')).toBeNull();
});
