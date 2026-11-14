// Reject archives that only install because the developer's checkout is nearby.
export function assertStandalonePackage(meta, lock) {
  if (lock.lockfileVersion !== 3 || lock.name !== meta.name || lock.version !== meta.version ||
      lock.packages?.['']?.version !== meta.version) throw new Error('Starter lockfile identity mismatch');
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const dependencies = meta[group] ?? {};
    if (JSON.stringify(dependencies) !== JSON.stringify(lock.packages[''][group] ?? {})) {
      throw new Error(`Starter lockfile ${group} mismatch`);
    }
    for (const spec of Object.values(dependencies)) {
      if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(spec)) throw new Error('Starter dependencies must be pinned registry versions');
    }
  }
  for (const [name, entry] of Object.entries(lock.packages)) {
    if (name !== '' && (!name.startsWith('node_modules/') || name.split('/').includes('..'))) {
      throw new Error('Starter lockfile contains an external path');
    }
    if (entry.link || (entry.resolved && !entry.resolved.startsWith('https://registry.npmjs.org/'))) {
      throw new Error('Starter lockfile contains a non-registry dependency');
    }
  }
}

// .4 is a documentation-only release. Keep the reviewed .3 Worker runtime and
// types identical after LF normalization; future runtime changes require review.
export function assertStarterSdkCompatibility(version, runtime, baselineRuntime, types, baselineTypes) {
  const normalize = value => Buffer.from(value).toString("utf8").replace(/\r\n?/g, "\n");
  if (version === '0.2.0-testnet.3') return;
  if (version === '0.2.0-testnet.4' && normalize(runtime) === normalize(baselineRuntime) &&
      normalize(types) === normalize(baselineTypes)) return;
  throw new Error('Review starter compatibility before upgrading the bundled SDK');
}
