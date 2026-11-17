/** Failed/unknown identities cannot exhaust the budget used by registered family members. */
export async function allowIdentityRequest(
  subject: string,
  recognized: boolean,
  authenticated: boolean,
  limit: (bucket: string, max: number) => Promise<boolean>,
) {
  if (!(await limit(`identity:subject:${subject}`, authenticated ? 120 : 10)))
    return "subject_limited";
  return recognized || (await limit("identity:unknown", 300))
    ? "allowed"
    : "unknown_limited";
}
