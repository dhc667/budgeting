import { lazy, Suspense } from "react";

// Loaded only when opened, for its chart library. Not the route's own `lazy`: on a reload the
// router would draw nothing at all, not even the app's frame, until the chunk arrived.
const ReportsScreen = lazy(() =>
  import("./ReportsScreen").then(({ ReportsScreen }) => ({ default: ReportsScreen })),
);

export function LazyReportsScreen() {
  return (
    <Suspense>
      <ReportsScreen />
    </Suspense>
  );
}
