// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { autoAnimate } from "@formkit/auto-animate";
import type { AnimationController } from "@formkit/auto-animate";
import { createListAnimationController, useListAutoAnimate } from "./useListAutoAnimate";

vi.mock("@formkit/auto-animate", () => ({ autoAnimate: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function animation() {
  return {
    disable: vi.fn(),
    enable: vi.fn(),
    destroy: vi.fn(),
  } as unknown as AnimationController;
}

describe("inbox list animation controller", () => {
  it("does not start row observers or polling on compact viewports", () => {
    const desktop = createListAnimationController();
    const compact = createListAnimationController(false);
    const animated = animation();
    vi.mocked(autoAnimate).mockReturnValue(animated);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    function List({ controller }: { controller: typeof desktop }) {
      const ref = useListAutoAnimate<HTMLDivElement>(controller);
      return createElement("div", { ref }, "Rows");
    }

    const view = render(createElement(List, { controller: compact }));
    expect(autoAnimate).not.toHaveBeenCalled();
    view.rerender(createElement(List, { controller: desktop }));
    expect(autoAnimate).toHaveBeenCalledOnce();
    view.rerender(createElement(List, { controller: compact }));
    expect(animated.destroy).toHaveBeenCalledOnce();
    expect(autoAnimate).toHaveBeenCalledOnce();
    view.unmount();
    expect(animated.destroy).toHaveBeenCalledOnce();
  });

  it("isolates holds and registrations between inbox mounts", () => {
    const first = createListAnimationController();
    const second = createListAnimationController();
    const a = animation();
    const b = animation();
    first.register(a);
    second.register(b);
    first.suspend();
    expect(a.disable).toHaveBeenCalledOnce();
    expect(b.disable).not.toHaveBeenCalled();
    second.resume();
    expect(a.enable).not.toHaveBeenCalled();
    first.resume();
    expect(a.enable).toHaveBeenCalledOnce();
    expect(b.enable).not.toHaveBeenCalled();
  });

  it("keeps new lists disabled until all holds finish and destroys detached lists", () => {
    const controller = createListAnimationController();
    controller.suspend();
    controller.suspend();
    const a = animation();
    const detach = controller.register(a);
    expect(a.disable).toHaveBeenCalledOnce();
    controller.resume();
    expect(a.enable).not.toHaveBeenCalled();
    controller.resume();
    expect(a.enable).toHaveBeenCalledOnce();
    controller.resume();
    expect(a.enable).toHaveBeenCalledOnce();
    detach();
    expect(a.destroy).toHaveBeenCalledOnce();
    controller.suspend();
    expect(a.disable).toHaveBeenCalledOnce();
  });
});
