import { configure } from "@testing-library/react";

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver = TestResizeObserver;

// Loaded runners need scheduling headroom; successful queries still resolve immediately.
configure({ asyncUtilTimeout: 5_000 });
