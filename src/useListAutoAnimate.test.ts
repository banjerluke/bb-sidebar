import { describe, expect, it, vi } from "vitest";
import type { AnimationController } from "@formkit/auto-animate";
import { createListAnimationController } from "./useListAutoAnimate";

function animation() {
  return {
    disable: vi.fn(),
    enable: vi.fn(),
    destroy: vi.fn(),
  } as unknown as AnimationController;
}

describe("inbox list animation controller", () => {
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
