import { createContext, useCallback, useContext } from "react";
import { autoAnimate, type AnimationController } from "@formkit/auto-animate";

// Each inbox owns its lists: a drag holds their geometry still while it reads
// insertion slots, without disabling another mounted inbox's animations.
export function createListAnimationController(enabled = true) {
  const animations = new Set<AnimationController>();
  let holds = 0;
  return {
    enabled,
    suspend() {
      holds += 1;
      if (holds > 1) return;
      for (const animation of animations) animation.disable();
    },
    resume() {
      if (holds === 0) return;
      holds -= 1;
      if (holds > 0) return;
      for (const animation of animations) animation.enable();
    },
    register(animation: AnimationController) {
      if (holds > 0) animation.disable();
      animations.add(animation);
      return () => {
        animations.delete(animation);
        // Auto-animate retains observers and a polling interval until destroyed.
        animation.destroy?.();
      };
    },
  };
}

export type ListAnimationController = ReturnType<typeof createListAnimationController>;
export const ListAnimationContext = createContext<ListAnimationController | null>(null);

export function useListAutoAnimate<T extends HTMLElement>(owner?: ListAnimationController) {
  const inherited = useContext(ListAnimationContext);
  const controller = owner ?? inherited;
  if (!controller) throw new Error("List animations require an inbox controller");
  return useCallback(
    (node: T | null) => {
      // Skip initialization on mobile: even idle lists poll every row's geometry.
      if (!node || !controller.enabled || typeof window.matchMedia !== "function") return;
      const animation = autoAnimate(node, {
        duration: 150,
        easing: "ease-out",
      });
      return controller.register(animation);
    },
    [controller],
  );
}
