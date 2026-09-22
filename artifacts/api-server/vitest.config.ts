import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // "forks" (a child process per test file) rather than "threads" because
    // test/setup.ts calls process.chdir(), which throws inside worker threads.
    // A process per file also gives each file its own module registry, so the
    // API's module-level seed() runs fresh for every file.
    pool: "forks",
    // Each file re-seeds ~130 records; give slow machines room.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
