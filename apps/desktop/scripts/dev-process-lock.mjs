import { rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const TERMINATION_POLL_INTERVAL_MS = 100;
const TERMINATION_TIMEOUT_MS = 2_000;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return false;
    }

    return true;
  }
}

function readProcessCommand(pid) {
  if (process.platform === "win32") {
    return null;
  }

  const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

async function terminateMatchingProcess(pid, commandMatch) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid || !isProcessRunning(pid)) {
    return;
  }

  const processCommand = readProcessCommand(pid);
  if (processCommand && !processCommand.includes(commandMatch)) {
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
    return;
  }

  const deadline = Date.now() + TERMINATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) {
      return;
    }

    await delay(TERMINATION_POLL_INTERVAL_MS);
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
  }
}

export async function acquireSingleProcessLock({ baseDir, lockName, commandMatch }) {
  const lockDirectory = join(baseDir, ".electron-runtime", "locks");
  const lockPath = join(lockDirectory, `${lockName}.pid`);

  await mkdir(lockDirectory, { recursive: true });

  let previousPid;
  try {
    const content = (await readFile(lockPath, "utf8")).trim();
    const parsedPid = Number.parseInt(content, 10);
    if (Number.isInteger(parsedPid) && parsedPid > 0) {
      previousPid = parsedPid;
    }
  } catch {
    previousPid = undefined;
  }

  if (previousPid !== undefined) {
    await terminateMatchingProcess(previousPid, commandMatch);
  }

  await writeFile(lockPath, `${process.pid}\n`);

  let released = false;
  return async function releaseSingleProcessLock() {
    if (released) {
      return;
    }

    released = true;

    try {
      const content = (await readFile(lockPath, "utf8")).trim();
      if (content === String(process.pid)) {
        await rm(lockPath, { force: true });
      }
    } catch {
      // Ignore cleanup races from overlapping shutdowns.
    }
  };
}
