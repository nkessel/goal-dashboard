// Wraps `next dev` so every server-side log line (compile output, server
// action errors, unhandled exceptions in server components, etc.) is
// mirrored into dev.log at the project root, in addition to showing up in
// the terminal exactly as before. Point of this: Claude can just read
// dev.log on request instead of you copy/pasting terminal output every
// time something breaks.
//
// Note: this only captures what actually prints to the `next dev` terminal
// — server-side stuff. Browser-side errors (a React error only visible in
// the browser's own devtools console) aren't written here; for those, tell
// Claude what page/action to reproduce and it can pull the browser console
// directly if it has Chrome access, or you can paste just that one error.
//
// Runs Next's CLI entry script directly with `node` (no `npx`, no shell)
// so there's exactly one child process — portable across Windows/macOS/
// Linux without relying on the OS-specific .cmd/.ps1 shim in .bin, and
// simple to actually kill (Ctrl+C or closing the terminal) without leaving
// an orphaned server behind.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error(`[dev-with-log] couldn't find ${nextBin} — run npm install first.`);
  process.exit(1);
}

const logPath = path.join(root, "dev.log");
// Truncate on each run (flags: "w") so dev.log always reflects the current
// `npm run dev` session, not a growing pile from every run this week.
const logStream = createWriteStream(logPath, { flags: "w" });

// Strip ANSI color/escape codes before writing to the file — the terminal
// still gets them (untouched passthrough below), but they're just noise
// when Claude reads the plain-text log.
const ANSI_PATTERN = /[][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
function stripAnsi(chunk) {
  return chunk.toString().replace(ANSI_PATTERN, "");
}

const child = spawn(process.execPath, [nextBin, "dev"], {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  logStream.write(stripAnsi(chunk));
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  logStream.write(stripAnsi(chunk));
});

child.on("exit", (code) => {
  logStream.end();
  process.exit(code ?? 0);
});
child.on("error", (err) => {
  logStream.write(`\n[dev-with-log] failed to start: ${err.message}\n`);
  logStream.end();
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
