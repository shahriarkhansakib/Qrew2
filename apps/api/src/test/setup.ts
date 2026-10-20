/**
 * Global test setup for API unit tests.
 * Runs before each test file via vitest setupFiles.
 */

process.env.DATABASE_URL ||= "postgresql://postgres:postgres@localhost:5432/test";
process.env.NODE_ENV ||= "test";

import { afterEach, beforeEach, vi } from "vitest";

// Suppress console.error noise from expected error paths
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});
