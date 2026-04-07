import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireSingleProcessLock } from "./dev-process-lock.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, "..");
const bunExecutable = process.versions.bun ? process.execPath : "bun";
const childExitGracePeriodMs = 1_500;
const releaseProcessLock = await acquireSingleProcessLock({
  baseDir: desktopDir,
  lockName: "dev-supervisor",
  commandMatch: `${desktopDir}/scripts/dev.mjs`,
});

const children = new Map();
let shuttingDown = false;

function trackChild(name, child) {
  children.set(name, child);

  child.once("error", (error) => {
    console.error(`[desktop-dev] failed to start ${name}:`, error);
    void shutdown(1);
  });

  child.once("exit", (code, signal) => {
    children.delete(name);

    if (shuttingDown) {
      return;
    }

    const exitCode = signal ? 1 : (code ?? 0);
    if (exitCode !== 0) {
      console.error(
        `[desktop-dev] ${name} exited unexpectedly` +
          (signal ? ` (signal ${signal})` : ` (code ${exitCode})`),
      );
    }

    void shutdown(exitCode);
  });
}

function startChild(name, scriptName) {
  const child = spawn(bunExecutable, ["run", scriptName], {
    cwd: desktopDir,
    env: process.env,
    stdio: "inherit",
  });

  trackChild(name, child);
}

async function waitForChildExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolvePromise) => {
    child.once("exit", () => resolvePromise(undefined));
    child.once("error", () => resolvePromise(undefined));
  });
}

async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  const runningChildren = [...children.values()];
  for (const child of runningChildren) {
    child.kill("SIGTERM");
  }

  const forceKillTimer = setTimeout(() => {
    for (const child of runningChildren) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }
  }, childExitGracePeriodMs);
  forceKillTimer.unref();

  await Promise.all(runningChildren.map((child) => waitForChildExit(child)));
  clearTimeout(forceKillTimer);
  await releaseProcessLock();
  process.exit(exitCode);
}

process.once("SIGINT", () => {
  void shutdown(130);
});
process.once("SIGTERM", () => {
  void shutdown(143);
});
process.once("SIGHUP", () => {
  void shutdown(129);
});

startChild("bundle", "dev:bundle");
startChild("electron", "dev:electron");
