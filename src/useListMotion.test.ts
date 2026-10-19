// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { createListAnimationController, useListMotion } from "./useListMotion";

const frames = new Map<number, FrameRequestCallback>();
const effects: Array<{ cancel: ReturnType<typeof vi.fn>; finish: () => void }> = [];
const animate = vi.fn(function (this: HTMLElement) {
  const effect = { cancel: vi.fn(), finish: () => {} };
  effects.push(effect);
  return {
    cancel: effect.cancel,
    effect: { getComputedTiming: () => ({ progress: 0.5 }) },
    addEventListener: (_name: string, callback: () => void) => {
      effect.finish = callback;
    },
  };
});
let sequence = 0;

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++sequence, callback);
      return sequence;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  frames.clear();
  effects.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function flush() {
  await Promise.resolve();
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(0);
}

function list(count = 0) {
  const parent = document.createElement("ul");
  parent.append(...Array.from({ length: count }, row));
  document.body.append(parent);
  return parent;
}
function row() {
  const node = document.createElement("li");
  Object.defineProperty(node, "offsetTop", {
    get: () => Array.from(node.parentElement?.children ?? []).indexOf(node) * 32,
  });
  return node;
}

describe("inbox list motion", () => {
  it("does not register geometry observers on compact viewports or with reduced motion", () => {
    const desktop = createListAnimationController();
    const compact = createListAnimationController(false);
    const register = vi.spyOn(desktop, "register");
    const compactRegister = vi.spyOn(compact, "register");
    function List({ controller }: { controller: typeof desktop }) {
      return createElement("ul", { ref: useListMotion<HTMLUListElement>(controller) });
    }
    const view = render(createElement(List, { controller: compact }));
    expect(compactRegister).not.toHaveBeenCalled();
    view.rerender(createElement(List, { controller: desktop }));
    expect(register).toHaveBeenCalledOnce();
    view.unmount();
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    render(createElement(List, { controller: desktop }));
    expect(register).toHaveBeenCalledOnce();
  });

  it("batches list changes into one frame and never animates layout dimensions", async () => {
    const controller = createListAnimationController();
    const first = list(2);
    const second = list(1);
    const detachFirst = controller.register(first);
    const detachSecond = controller.register(second);
    first.prepend(row());
    second.prepend(row());
    await flush();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledTimes(5);
    for (const args of animate.mock.calls) {
      for (const keyframe of (args as unknown as [Keyframe[]])[0]) {
        expect(Object.keys(keyframe).sort()).toEqual(["opacity", "transform"]);
      }
    }
    detachFirst();
    detachSecond();
    expect(effects.every((effect) => effect.cancel.mock.calls.length === 1)).toBe(true);
  });

  it("skips bulk expansion and collapse, keeps removed rows absent, and resumes small updates", async () => {
    const controller = createListAnimationController();
    const parent = list();
    const detach = controller.register(parent);
    parent.append(...Array.from({ length: 100 }, row));
    await flush();
    expect(animate).not.toHaveBeenCalled();
    parent.replaceChildren();
    await flush();
    expect(parent.children).toHaveLength(0);
    expect(animate).not.toHaveBeenCalled();
    parent.append(row());
    await flush();
    expect(animate).toHaveBeenCalledOnce();
    effects[0]!.finish();
    detach();
    expect(effects[0]!.cancel).not.toHaveBeenCalled();
  });

  it("continues an interrupted move from its current visual position", async () => {
    const controller = createListAnimationController();
    const parent = list(1);
    const original = parent.firstElementChild;
    const detach = controller.register(parent);
    parent.prepend(row());
    await flush();
    parent.prepend(row());
    await flush();
    const calls = animate.mock.calls.filter((_, index) => animate.mock.contexts[index] === original);
    // Half of the first 32px move remains when another row arrives.
    expect((calls.at(-1) as unknown as [Keyframe[]])[0][0]?.transform).toBe("translate(0px, -48px)");
    detach();
  });

  it("isolates nested drag holds between inboxes and registers new lists while suspended", async () => {
    const first = createListAnimationController();
    const second = createListAnimationController();
    first.suspend();
    first.suspend();
    const a = list();
    const b = list();
    const detachA = first.register(a);
    const detachB = second.register(b);
    a.append(row());
    b.append(row());
    await flush();
    expect(animate).toHaveBeenCalledOnce();
    first.resume();
    a.append(row());
    await flush();
    expect(animate).toHaveBeenCalledOnce();
    first.resume();
    await flush();
    expect(animate).toHaveBeenCalledOnce();
    a.append(row());
    await flush();
    expect(animate).toHaveBeenCalledTimes(2);
    detachA();
    detachB();
  });

  it("cancels pending frames and animations on detach, and does no idle polling", async () => {
    const controller = createListAnimationController();
    const parent = list();
    const interval = vi.spyOn(window, "setInterval");
    const detach = controller.register(parent);
    parent.append(row());
    await flush();
    parent.append(row());
    await Promise.resolve();
    expect(frames.size).toBe(1);
    detach();
    expect(frames.size).toBe(0);
    expect(effects[0]!.cancel).toHaveBeenCalledOnce();
    expect(interval).not.toHaveBeenCalled();
    parent.append(row());
    await flush();
    expect(animate).toHaveBeenCalledOnce();
    interval.mockRestore();
  });
});
