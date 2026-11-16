import { expect, it } from "vitest";
import { parseActivationFragment } from "../src/components/ActivationLink";
it("activation accepts only one-use token format and valid username", () => {
  const token = "a".repeat(64);
  expect(
    parseActivationFragment(`#activate=${token}&username=fictitious_admin`),
  ).toEqual({ token, username: "fictitious_admin" });
  expect(
    parseActivationFragment(`#activate=bad&username=fictitious_admin`),
  ).toBeNull();
  expect(
    parseActivationFragment(`#activate=${token}&username=%3Cscript%3E`),
  ).toBeNull();
  expect(parseActivationFragment("#normal-navigation")).toBeNull();
});
