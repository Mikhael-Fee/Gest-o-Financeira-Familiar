import { expect, it } from "vitest";
import { allowIdentityRequest } from "../server/identityLimits";
it("esgotar identidades desconhecidas não bloqueia login, convite válido ou gestão autenticada", async () => {
  const counters = new Map<string, number>();
  const limit = async (key: string, max: number) => {
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return n <= max;
  };
  for (let i = 0; i < 301; i++)
    await allowIdentityRequest("unknown-" + i, false, false, limit);
  expect(await allowIdentityRequest("unknown-extra", false, false, limit)).toBe(
    "unknown_limited",
  );
  expect(await allowIdentityRequest("known-login", true, false, limit)).toBe(
    "allowed",
  );
  expect(await allowIdentityRequest("valid-invite", true, false, limit)).toBe(
    "allowed",
  );
  expect(await allowIdentityRequest("verified-admin", true, true, limit)).toBe(
    "allowed",
  );
  for (let i = 0; i < 9; i++)
    expect(await allowIdentityRequest("known-login", true, false, limit)).toBe(
      "allowed",
    );
  expect(await allowIdentityRequest("known-login", true, false, limit)).toBe(
    "subject_limited",
  );
});
it("falhas de persistência fecham o acesso e não consomem orçamento global após limite individual", async () => {
  await expect(
    allowIdentityRequest("x", true, false, async () => {
      throw Error("offline");
    }),
  ).rejects.toThrow("offline");
  const seen: string[] = [];
  expect(
    await allowIdentityRequest("x", false, false, async (k) => {
      seen.push(k);
      return false;
    }),
  ).toBe("subject_limited");
  expect(seen).toHaveLength(1);
});
