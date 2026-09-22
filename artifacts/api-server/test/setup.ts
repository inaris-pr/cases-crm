// Runs once per test file, before that file's imports are evaluated.
//
// The API server resolves its persisted store as process.cwd()/data/store.json
// (see src/store.ts). Tests therefore chdir into a throwaway directory before
// anything imports the store, which guarantees two things:
//
//   1. the repository's artifacts/api-server/data/store.json is never read or
//      written by the suite, and
//   2. every test file starts from the deterministic seed in store.ts rather
//      than from another file's leftovers.
//
// test/isolation.test.ts asserts both properties rather than trusting them.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cases-api-test-"));
fs.mkdirSync(path.join(dir, "data"), { recursive: true });
process.chdir(dir);

// pino only attaches the pino-pretty transport outside production; in tests
// that would spawn a worker thread per file and keep vitest from exiting.
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "silent";
