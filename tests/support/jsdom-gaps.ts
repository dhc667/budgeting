// jsdom lays nothing out, so it has no ResizeObserver; Headless UI's combobox watches its input
// with one.
class NoResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= NoResizeObserver;
