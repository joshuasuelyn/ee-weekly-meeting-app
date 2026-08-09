import { describe, expect, it } from "vitest";
import { normaliseUrl } from "./config";

// The deployment that cost an evening had SUPABASE_URL set to the REST endpoint shown on
// the Supabase API page rather than the project origin. Supabase answered "Invalid path
// specified in request URL", which names neither the variable nor the cause.
describe("normaliseUrl", () => {
  it("keeps a clean project origin unchanged", () => {
    expect(normaliseUrl("https://gqvmborafrwsidsesqen.supabase.co")).toBe(
      "https://gqvmborafrwsidsesqen.supabase.co",
    );
  });

  it("strips the REST path that the API page displays", () => {
    expect(normaliseUrl("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
  });

  it("strips a trailing slash", () => {
    expect(normaliseUrl("https://abc.supabase.co/")).toBe("https://abc.supabase.co");
  });

  it("strips any other stray path", () => {
    expect(normaliseUrl("https://abc.supabase.co/auth/v1")).toBe("https://abc.supabase.co");
  });

  it("drops query strings and fragments", () => {
    expect(normaliseUrl("https://abc.supabase.co/?apikey=x#y")).toBe("https://abc.supabase.co");
  });

  it("keeps an explicit port, which local Supabase uses", () => {
    expect(normaliseUrl("http://localhost:54321/rest/v1")).toBe("http://localhost:54321");
  });

  it("trims surrounding whitespace from a careless paste", () => {
    expect(normaliseUrl("  https://abc.supabase.co  ")).toBe("https://abc.supabase.co");
  });

  it("returns undefined for missing or empty values", () => {
    expect(normaliseUrl(undefined)).toBeUndefined();
    expect(normaliseUrl("")).toBeUndefined();
    expect(normaliseUrl("   ")).toBeUndefined();
  });

  it("falls back to trailing-slash trimming when the value is not a URL", () => {
    expect(normaliseUrl("not a url/")).toBe("not a url");
  });
});
