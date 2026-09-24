import request from "supertest";
import type { Express } from "express";

/** Request helpers bound to one employee's session cookie. */
export function apiAs(app: Express, cookie: Promise<{ Cookie: string }> | { Cookie: string }) {
  const go = async (method: "get" | "post" | "patch" | "put" | "delete", url: string, body?: unknown) => {
    const r = request(app)[method](`/api${url}`).set(await cookie);
    return body === undefined ? r : r.send(body as object);
  };
  return {
    get: (url: string) => go("get", url),
    post: (url: string, body: unknown = {}) => go("post", url, body),
    patch: (url: string, body: unknown) => go("patch", url, body),
    put: (url: string, body: unknown) => go("put", url, body),
    del: (url: string) => go("delete", url),
  };
}
