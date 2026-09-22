/**
 * Run `pnpm api:generate` from the repo root to regenerate ./src
 * from lib/api-spec/openapi.yaml.
 */
module.exports = {
  cases: {
    input: "../api-spec/openapi.yaml",
    output: {
      target: "./src/index.ts",
      schemas: "./src/model",
      client: "react-query",
      mode: "single",
      override: {
        mutator: {
          path: "./src/http.ts",
          name: "fetchJson",
        },
      },
    },
  },
};
