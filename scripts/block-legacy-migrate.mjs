console.error('db:push is disabled: the legacy drizzle migration lineage must not run on druto_testnet. Use db:verify:testnet for read-only checks; new forward migrations require a reviewed runner.');
process.exitCode = 1;
