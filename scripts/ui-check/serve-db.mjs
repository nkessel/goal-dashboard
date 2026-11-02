// Run the fake database on its own (for poking at the app by hand):
//   node scripts/ui-check/serve-db.mjs [port]
import { startFakeDb } from "./fake-db.mjs";
import { makeFixtures } from "./fixtures.mjs";
const port = Number(process.argv[2] || 54329);
const db = await startFakeDb({ port, fixtures: makeFixtures(), quiet: false });
console.log(`fake db on http://127.0.0.1:${port}`);
process.on("SIGTERM", () => { db.close(); process.exit(0); });
