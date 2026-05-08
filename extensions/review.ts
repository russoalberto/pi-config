/**
 * /review command for Pi
 *
 * Mirrors OpenCode's review.txt template behavior.
 * Gathers diff + file context + conventions, then triggers
 * the agent to perform a code review.
 *
 * Usage:
 *   /review              - Review uncommitted changes
 *   /review <commit>     - Review a specific commit (SHA or short hash)
 *   /review <branch>     - Compare current branch to another branch
 *   /review branch       - Review current branch against its base (main/origin/main)
 *   /review <pr-url|#>   - Review a GitHub PR (requires gh CLI)
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// ── Git helpers ──

function git(args: string): string {
  return execSync(`git ${args}`, { encoding: "utf-8", timeout: 10_000 });
}

function gitTry(args: string): string | null {
  try {
    return git(args);
  } catch {
    return null;
  }
}

// ── Detect review target from args ──

type ReviewTarget =
  | { type: "uncommitted" }
  | { type: "commit"; ref: string }
  | { type: "branch"; branch: string; currentBranch?: string }
  | { type: "pr"; pr: string }
  | { type: "staged" };

function getCurrentBranch(): string {
  return git("rev-parse --abbrev-ref HEAD").trim();
}

function getBaseBranch(): string {
  // Try common base branch names in order of preference
  const candidates = ["origin/main", "origin/master", "main", "master"];
  for (const candidate of candidates) {
    const ref = gitTry(`rev-parse --verify ${candidate}`);
    if (ref) return candidate;
  }
  // Fallback: use @{upstream} if set
  const upstream = gitTry("rev-parse --abbrev-ref --symbolic-full-name @{upstream}");
  if (upstream) return upstream.trim();

  return "main";
}

function detectTarget(args: string): ReviewTarget {
  const trimmed = args.trim();

  if (!trimmed) return { type: "uncommitted" };

  // /review branch — review current branch against its base
  if (trimmed === "branch") {
    const currentBranch = getCurrentBranch();
    const baseBranch = getBaseBranch();
    return { type: "branch", branch: baseBranch, currentBranch };
  }

  // PR URL or number
  if (
    trimmed.includes("github.com") ||
    trimmed.includes("pull") ||
    /^\d{1,10}$/.test(trimmed)
  ) {
    return { type: "pr", pr: trimmed };
  }

  // Check if it's a valid git ref (commit SHA or short hash)
  const shaMatch = trimmed.match(/^[a-f0-9]{7,40}$/i);
  if (shaMatch) {
    // Verify it's a real commit
    const show = gitTry(`cat-file -t ${trimmed}`);
    if (show === "commit") return { type: "commit", ref: trimmed };
  }

  // Treat as branch name
  return { type: "branch", branch: trimmed };
}

// ── Gather diff ──

function gatherDiff(target: ReviewTarget): { diff: string; untracked: string } {
  switch (target.type) {
    case "uncommitted": {
      const staged = gitTry("diff --cached") ?? "";
      const unstaged = gitTry("diff") ?? "";
      const status = git("status --short");
      const untrackedFiles = status
        .split("\n")
        .filter((l) => l.startsWith("??"))
        .map((l) => l.slice(3).trim());

      const untracked = untrackedFiles
        .map((f) => {
          const content = gitTry(`show HEAD:${f}`) ?? readFileSync(f, "utf-8");
          return `--- untracked: ${f}\n+++ ${f}\n@@ -0,0 +1,${content.split("\n").length} @@\n${content}`;
        })
        .join("\n");

      return { diff: [staged, unstaged, untracked].filter(Boolean).join("\n"), untracked: status };
    }

    case "staged": {
      return { diff: git("diff --cached"), untracked: "" };
    }

    case "commit": {
      return { diff: git(`show ${target.ref}`), untracked: "" };
    }

    case "branch": {
      const branchName = target.currentBranch || "HEAD";
      const compareRef = target.branch;
      const mergeBase = gitTry(`merge-base ${compareRef} ${branchName}`)?.trim() ?? compareRef;
      return { diff: git(`diff ${mergeBase}...${branchName}`), untracked: "" };
    }

    case "pr": {
      const prNum = target.pr.replace(/\D/g, "");
      const body = gitTry(`gh pr view ${prNum} --json body,title,headRefName,baseRefName`);
      const diff = gitTry(`gh pr diff ${prNum}`) ?? "No diff available";
      return { diff: `PR #${prNum}:\n${body}\n\n${diff}`, untracked: "" };
    }
  }
}

// ── Read full files that changed ──

function gatherFileContext(diff: string): string {
  const changedFiles: string[] = [];
  for (const line of diff.split("\n")) {
    const m = line.match(/^(?:---\s+a\/|\+\+\+\s+b\/)(.+)$/);
    if (m) changedFiles.push(m[1]);
  }

  const uniqueFiles = [...new Set(changedFiles)].filter((f) => existsSync(f));
  const parts: string[] = [];

  for (const file of uniqueFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      // Truncate huge files
      const lines = content.split("\n");
      const truncated = lines.length > 500
        ? lines.slice(0, 500).join("\n") + "\n[... truncated at 500 lines]"
        : content;
      parts.push(`\n### ${file}\n\`\`\`\n${truncated}\n\`\`\``);
    } catch {
      // skip unreadable
    }
  }

  return parts.join("\n");
}

// ── Gather conventions ──

function gatherConventions(): string {
  const candidates = ["CONVENTIONS.md", "AGENTS.md", ".editorconfig", ".cursor/rules/*.md"];
  const parts: string[] = [];

  for (const pattern of candidates) {
    if (pattern.includes("*")) {
      // glob — use bash expansion
      const dir = dirname(pattern);
      if (existsSync(dir)) {
        const files = execSync(`ls ${pattern} 2>/dev/null || true`, {
          encoding: "utf-8",
          timeout: 2000,
        })
          .trim()
          .split("\n")
          .filter(Boolean);
        for (const f of files) {
          try {
            parts.push(`\n### Conventions: ${f}\n${readFileSync(f, "utf-8")}`);
          } catch { /* skip */ }
        }
      }
    } else if (existsSync(pattern)) {
      try {
        parts.push(`\n### Conventions: ${pattern}\n${readFileSync(pattern, "utf-8")}`);
      } catch { /* skip */ }
    }
  }

  return parts.join("\n");
}

// ── Build review prompt ──

function getTargetDesc(target: ReviewTarget): string {
  switch (target.type) {
    case "uncommitted": return "uncommitted changes";
    case "staged": return "staged changes";
    case "commit": return `commit ${target.ref}`;
    case "branch": {
      const branch = target.currentBranch
        ? `current branch \`${target.currentBranch}\` against \`${target.branch}\``
        : `branch comparison with \`${target.branch}\``;
      return branch;
    }
    case "pr": return `PR #${target.pr}`;
  }
}

function buildReviewPrompt(target: ReviewTarget, diff: string, status: string, fileContext: string, conventions: string): string {
  const targetDesc = getTargetDesc(target);

  const parts = [
    `You are a code reviewer. Review these ${targetDesc} and provide actionable feedback.`,
    "",
    "---",
    "",
    status ? `### Git Status\n\`\`\`\n${status}\n\`\`\`\n` : "",
    "",
    diff ? `### Diff\n\`\`\`diff\n${diff}\n\`\`\`\n` : "",
    fileContext ? `### Full File Context\n${fileContext}\n` : "",
    conventions ? `### Project Conventions\n${conventions}\n` : "",
    "",
    `---`,
    ``,
    `## What to Look For`,
    ``,
    `**Bugs** - Your primary focus.`,
    `- Logic errors, off-by-one mistakes, incorrect conditionals`,
    `- If-else guards: missing guards, incorrect branching, unreachable code paths`,
    `- Edge cases: null/empty/undefined inputs, error conditions, race conditions`,
    `- Security issues: injection, auth bypass, data exposure`,
    `- Broken error handling that swallows failures, throws unexpectedly, or returns error types that are not caught`,
    ``,
    `**Structure** - Does the code fit the codebase?`,
    `- Does it follow existing patterns and conventions?`,
    `- Are there established abstractions it should use but doesn't?`,
    `- Excessive nesting that could be flattened with early returns or extraction`,
    ``,
    `**Performance** - Only flag if obviously problematic.`,
    `- O(n²) on unbounded data, N+1 queries, blocking I/O on hot paths`,
    ``,
    `**Behavior Changes** - If a behavioral change is introduced, raise it (especially if possibly unintentional).`,
    ``,
    `## Guidelines`,
    ``,
    `- Only review the changes — do not review pre-existing code that wasn't modified`,
    `- Don't flag something as a bug if you're unsure — investigate first`,
    `- Don't invent hypothetical problems — explain the realistic scenario where it breaks`,
    `- If you need more context to be sure, read the relevant files`,
    `- Don't be a zealot about style. Check against actual project conventions.`,
    `- Clearly communicate severity of issues. Do not overstate.`,
    `- AVOID flattery. No "great job" or "thanks". Direct, matter-of-fact feedback.`,
    `- Write so the reader can quickly understand the issue without reading closely.`,
  ];

  return parts.filter(Boolean).join("\n");
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
  pi.registerCommand("review", {
    description: "Review code changes (uncommitted, commit, branch, or PR)",
    handler: async (args, ctx) => {
      // 1. Detect target
      const target = detectTarget(args);
      ctx.ui.notify(`Reviewing ${target.type}: ${args || "uncommitted changes"}`, "info");

      // 2. Gather diff
      const { diff, untracked: status } = gatherDiff(target);
      if (!diff && !status) {
        ctx.ui.notify("No changes to review", "warning");
        return;
      }

      if (!diff) {
        ctx.ui.notify("No diff available", "warning");
        return;
      }

      // 3. Read full file context
      const fileContext = gatherFileContext(diff);

      // 4. Gather conventions
      const conventions = gatherConventions();

      // 5. Build prompt and send
      const prompt = buildReviewPrompt(target, diff, status, fileContext, conventions);

      ctx.ui.notify("Review prompt sent to agent", "info");
      pi.sendUserMessage(prompt);
    },
  });
}
