/**
 * The shared permission model (lib/access, the @cases/access workspace
 * package), re-exported for the API. Imported by relative path so the API's
 * esbuild bundle includes it and no install step or path alias is needed.
 */
export * from "../../../lib/access/src/index";
