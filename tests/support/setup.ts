import { configure } from "@testing-library/react";

// Screens wait on round trips to a real database, which on a loaded CI runner can take longer than
// Testing Library's default second.
configure({ asyncUtilTimeout: 5_000 });
