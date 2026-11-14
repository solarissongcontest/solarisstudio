/** Local Docker transport is deliberately restricted to the existing networkless
 * recovery fixture. It cannot accept a hosted URL, arbitrary database or role. */
export function requireS16NetworklessFixture(input: {
  container: string;
  database: string;
  fixtureSourceSha: string;
  inspect: string;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.container))
    throw new Error("S16 requires a full local container ID");
  if (!["recovery_operator_baseline", "recovery_restore_probe"].includes(input.database)) {
    throw new Error("S16 Docker collection requires the named disposable recovery database");
  }
  if (!/^[a-f0-9]{40}$/.test(input.fixtureSourceSha))
    throw new Error("S16 requires the fixture assembly source SHA separately from candidate SHA");
  const rows = JSON.parse(input.inspect) as Array<{
    State?: { Running?: boolean };
    HostConfig?: { NetworkMode?: string; PortBindings?: Record<string, unknown> | null };
  }>;
  if (
    rows.length !== 1 ||
    rows[0].State?.Running !== true ||
    rows[0].HostConfig?.NetworkMode !== "none" ||
    Object.keys(rows[0].HostConfig?.PortBindings ?? {}).length
  ) {
    throw new Error("S16 Docker fixture must be running, networkless and publish no ports");
  }
  return {
    container: input.container,
    database: input.database,
    fixtureSourceSha: input.fixtureSourceSha,
  };
}
