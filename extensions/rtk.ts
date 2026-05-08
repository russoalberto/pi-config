/**
 * RTK Extension for Pi
 *
 * Hooks into `read` and `bash` tools to use `rtk` (Read Token Killer) for
 * intelligent token-optimized output. Cuts context token waste on file reads,
 * git ops, ls/tree, test runners, linters, and common CLI commands.
 *
 * Features:
 *   1. Overrides `read` tool → uses `rtk read` with level-based filtering
 *   2. Intercepts `bash` tool calls → rewrites via `rtk rewrite` automatically
 *   3. `/rtk` command → shows token savings stats from `rtk gain`
 *
 * Requires: rtk >= 0.23.0 in PATH (https://github.com/obra/rtk)
 */

import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { execFile, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { access, constants, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Type } from "typebox";

// ——— helpers ———

function execFileAsync(
  cmd: string,
  args: string[],
  opts: { encoding: BufferEncoding; timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout: stdout as string, stderr: stderr as string });
    });
  });
}

function rtkInPath(): boolean {
  try {
    execSync("which rtk", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function rtkRewrite(command: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("rtk", ["rewrite", command], {
      encoding: "utf-8",
      timeout: 3000,
    });
    const out = stdout.trim();
    return out.length > 0 && out !== command ? out : null;
  } catch {
    return null;
  }
}

async function rtkRead(
  file: string,
  opts: { level?: string; maxLines?: number; tailLines?: number; lineNumbers?: boolean },
): Promise<string> {
  const args: string[] = ["read"];
  if (opts.level) args.push("-l", opts.level);
  if (opts.maxLines) args.push("-m", String(opts.maxLines));
  if (opts.tailLines) args.push("--tail-lines", String(opts.tailLines));
  if (opts.lineNumbers) args.push("-n");
  args.push(file);

  const { stdout } = await execFileAsync("rtk", args, {
    encoding: "utf-8",
    timeout: 10_000,
  });
  return stdout;
}

// Decide filtering level based on file size / type heuristics
function pickLevel(path: string, content: string): string {
  const lines = content.split("\n").length;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";

  // Aggressive for lockfiles, big data, minified assets
  if (["lockb", "lock", "map", "min.js", "min.css", "svg"].includes(ext) || lines > 3000) {
    return "aggressive";
  }

  // Minimal for moderately large or boilerplate-heavy files
  if (
    ["json", "yaml", "yml", "toml", "csv", "tsv", "xml", "sql"].includes(ext) ||
    lines > 500
  ) {
    return "minimal";
  }

  // Full for small source files
  return "none";
}

// ——— schema ———

const readSchema = Type.Object({
  path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
  offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
});

// ——— extension ———

export default function (pi: ExtensionAPI) {
  if (!rtkInPath()) {
    console.warn("[rtk] rtk binary not found in PATH — extension disabled");
    return;
  }

  // ── 1. Override `read` tool with rtk read ──

  pi.registerTool({
    name: "read",
    label: "read (rtk-optimized)",
    description:
      "Read the contents of a file with intelligent token optimization via rtk. "
      + "Automatically chooses filtering level (none/minimal/aggressive) based on file size and type. "
      + "Supports offset and limit for partial reads.",
    parameters: readSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { path, offset, limit } = params;
      const absolutePath = resolve(ctx.cwd, path);

      try {
        await access(absolutePath, constants.R_OK);
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error reading file: ${err.message}` }],
          details: { error: true },
        };
      }

      // Full content for level detection
      const fullContent = await readFile(absolutePath, "utf-8");
      const allLines = fullContent.split("\n");

      // If offset/limit provided, use old-school slicing (user wants specific lines)
      if (offset || limit) {
        const start = offset ? Math.max(0, offset - 1) : 0;
        const end = limit ? start + limit : allLines.length;
        const selected = allLines.slice(start, end).join("\n");

        let text = selected;
        const maxBytes = 50 * 1024;
        if (Buffer.byteLength(text, "utf-8") > maxBytes) {
          text = text.slice(0, maxBytes) + "\n\n[Output truncated at 50KB]";
        }

        return {
          content: [{ type: "text", text }],
          details: { lines: allLines.length, startLine: start + 1, endLine: end },
        };
      }

      // Use rtk read for intelligent filtering
      try {
        const level = pickLevel(path, fullContent);
        const rtkOutput = await rtkRead(absolutePath, { level });

        return {
          content: [{ type: "text", text: rtkOutput }],
          details: { lines: allLines.length, filterLevel: level },
        };
      } catch (err: any) {
        // Fallback to raw read if rtk fails
        let text = fullContent;
        const maxBytes = 50 * 1024;
        if (Buffer.byteLength(text, "utf-8") > maxBytes) {
          text = text.slice(0, maxBytes) + "\n\n[Output truncated at 50KB]";
        }

        return {
          content: [{ type: "text", text }],
          details: { lines: allLines.length, fallback: true },
        };
      }
    },
  });

  // ── 2. Intercept bash calls → rtk rewrite ──

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command as string;
    if (!command || command.trim().length === 0) return;

    const rewritten = await rtkRewrite(command);
    if (rewritten) {
      event.input.command = rewritten;
    }
  });

  // ── 3. /rtk command for stats ──

  pi.registerCommand("rtk", {
    description: "Show RTK token savings statistics",
    handler: async (_args, ctx) => {
      try {
        const stats = execSync("rtk gain --format text", {
          encoding: "utf-8",
          timeout: 5000,
        });
        ctx.ui.notify(stats.trim(), "info");
      } catch {
        ctx.ui.notify("Failed to get RTK stats", "error");
      }
    },
  });

  pi.registerCommand("rtk-stats", {
    description: "Alias for /rtk — show RTK token savings",
    handler: async (_args, ctx) => {
      try {
        const stats = execSync("rtk gain --format text", {
          encoding: "utf-8",
          timeout: 5000,
        });
        ctx.ui.notify(stats.trim(), "info");
      } catch {
        ctx.ui.notify("Failed to get RTK stats", "error");
      }
    },
  });
}
