import { describe, expect, it } from "vitest";
import { interactionSummary, lastLineOf } from "./thread-note";

describe("lastLineOf", () => {
  it("takes the last line of prose, skipping fenced blocks, tables, and rules", () => {
    const message = [
      "Merged **#57** and removed the [worktree](https://example.com).",
      "",
      "| a | b |",
      "|---|---|",
      "```ui",
      'Card("Done", [])',
      "```",
      "---",
    ].join("\n");
    expect(lastLineOf(message)).toBe("Merged #57 and removed the worktree.");
  });

  it("drops list and heading markers but keeps identifiers intact", () => {
    expect(lastLineOf("Summary\n- Want me to rename `snake_case_name` too?")).toBe(
      "Want me to rename snake_case_name too?",
    );
  });

  it("drops the italics an agent sets its headline in", () => {
    expect(lastLineOf("Done.\n\n*Merged #212; nothing left*")).toBe("Merged #212; nothing left");
    expect(lastLineOf("Done.\n\n_Needs your call: squash or rebase?_")).toBe("Needs your call: squash or rebase?");
  });

  it("clips a long line to one row's worth", () => {
    const line = lastLineOf("word ".repeat(100))!;
    expect(line.length).toBeLessThanOrEqual(160);
    expect(line.endsWith("…")).toBe(true);
  });

  it("returns null when there is nothing to show", () => {
    expect(lastLineOf(null)).toBeNull();
    expect(lastLineOf("```\ncode only\n```")).toBeNull();
  });
});

describe("interactionSummary", () => {
  it("names what a question or an approval asks", () => {
    expect(
      interactionSummary({
        payload: { kind: "user_question", questions: [{ prompt: "Which base branch should I use?" }] },
      }),
    ).toBe("Which base branch should I use?");
    expect(
      interactionSummary({
        payload: { kind: "approval", reason: null, subject: { kind: "command", command: "git push --force" } },
      }),
    ).toBe("Approve: git push --force");
  });

  it("returns null for a kind it does not know", () => {
    expect(interactionSummary({ payload: { kind: "something_new" } })).toBeNull();
    expect(interactionSummary(null)).toBeNull();
  });
});
