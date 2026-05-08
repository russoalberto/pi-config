/**
 * Permission Gate Extension for Pi
 *
 * Mirrors OpenCode's `ask` permission model exactly.
 * Intercepts bash tool calls and asks for user confirmation
 * before executing sensitive or destructive commands.
 *
 * Every pattern below is `ask` — no silent blocks.
 */

import { type ExtensionAPI, isToolCallEventType } from "@earendil-works/pi-coding-agent";

// ── All patterns = ask (mirrors OpenCode config) ──

interface Rule {
  pattern: RegExp;
  label: string;
}

const RULES: Rule[] = [
  // ── Sensitive reads (from OpenCode) ──
  { pattern: /\bcat\s+.*\.env/i, label: "cat .env*" },
  { pattern: /\bcat\s+.*\.key\b/i, label: "cat *.key" },
  { pattern: /\bcat\s+.*\.pem\b/i, label: "cat *.pem" },
  { pattern: /\bcat\s+.*\.tfstate/i, label: "cat *.tfstate*" },
  { pattern: /\bcat\s+.*credentials/i, label: "cat *credentials*" },
  { pattern: /\bcat\s+.*\bhistory\b/i, label: "cat *history" },
  { pattern: /\bcat\s+.*kubeconfig/i, label: "cat *kubeconfig*" },
  { pattern: /\bcat\s+.*token/i, label: "cat *token*" },
  { pattern: /\bcat\s+\.ssh\//i, label: "cat .ssh/*" },

  // ── Docker ──
  { pattern: /\bdocker\s+exec\b/i, label: "docker exec *" },
  { pattern: /\bdocker\s+run\s+.*-it\b/i, label: "docker run *-it*" },
  { pattern: /\bdocker\s+run\s+.*\bbash\b/i, label: "docker run *bash*" },
  { pattern: /\bdocker\s+run\s+.*\bsh\b/i, label: "docker run *sh*" },

  // ── Env leakage ──
  { pattern: /^\s*env\s*$/i, label: "env" },
  { pattern: /\bprintenv\b/i, label: "printenv" },

  // ── AWS secret search ──
  { pattern: /\b(grep|rg)\s+.*\.aws\//i, label: "grep/rg *.aws/*" },

  // ── Kubernetes ──
  { pattern: /\bkubectl\s+delete\b/i, label: "kubectl delete*" },
  { pattern: /\bkubectl\s+describe\s+secret/i, label: "kubectl describe secret*" },

  // ── File system destruction ──
  { pattern: /\brm\s+(-rf|-fr|--recursive)\b/i, label: "rm -rf *" },
  { pattern: /\brm\s+-[a-z]*(r[a-z]*f|f[a-z]*r)[a-z]*\b/i, label: "rm -rf (alt)" },
  { pattern: /\b(wipefs|shred|dd|mkfs|fdisk|parted)\b/i, label: "destructive cmd" },

  // ── Permission changes ──
  { pattern: /\bchmod\s+[0-7]*7[0-7]*\s/i, label: "chmod 777 (world-writable)" },
  { pattern: /\bchmod\s+-R\b/i, label: "chmod -R (recursive)" },
  { pattern: /\bchown\s+-R\b/i, label: "chown -R" },
  { pattern: /\bsudo\b/i, label: "sudo" },

  // ── Git destruction ──
  { pattern: /\bgit\s+push\s+.*(--force|--force-with-lease)\b/i, label: "git push --force" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, label: "git reset --hard" },
  { pattern: /\bgit\s+clean\s+(-[a-z]*d[a-z]*)\b/i, label: "git clean (delete untracked)" },

  // ── Infrastructure destruction ──
  { pattern: /\bterraform\s+apply\b/i, label: "terraform apply*" },
  { pattern: /\bterraform\s+destroy\b/i, label: "terraform destroy*" },
  { pattern: /\btofu\s+apply\b/i, label: "tofu apply*" },
  { pattern: /\btofu\s+destroy\b/i, label: "tofu destroy*" },
];

// ── Helpers ──

function findMatch(command: string): Rule | null {
  for (const rule of RULES) {
    if (rule.pattern.test(command)) return rule;
  }
  return null;
}

function isProdEnvironment(): boolean {
  // Check working directory path for prod indicators
  const pwd = process.env.PWD ?? "";
  if (/\b(prod|production)\b/i.test(pwd)) return true;

  // Check common environment variables
  if (process.env.NODE_ENV === "production") return true;
  if (/\b(prod|production)\b/i.test(process.env.ENV ?? "")) return true;
  if (/\b(prod|production)\b/i.test(process.env.ENVIRONMENT ?? "")) return true;
  if (/\b(prod|production)\b/i.test(process.env.DEPLOY_ENV ?? "")) return true;

  // Check AWS profile
  if (/\bprod\b/i.test(process.env.AWS_PROFILE ?? "")) return true;

  // Check hostname for prod patterns
  if (/\b(prod|production)\b/i.test(process.env.HOSTNAME ?? "")) return true;

  return false;
}

// ── Extension ──

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = (event.input.command as string) ?? "";
    if (command.trim().length === 0) return;

    const rule = findMatch(command);
    if (!rule) return;

    if (command.includes("--skip-perm-gate")) {
      // Opt-out flag for when user really means it
      event.input.command = command.replace(/\s*--skip-perm-gate\s*/, "").trim();
      return;
    }

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `Blocked by permission gate: ${rule.label} (no UI for confirmation)`,
      };
    }

    const isProd = isProdEnvironment();
    const parts: string[] = ["⚠️  Permission required"];

    if (isProd) parts.push("🚨 PRODUCTION ENVIRONMENT DETECTED");
    parts.push("");
    parts.push(`Command:  ${command}`);
    parts.push(`Rule:     ${rule.label}`);
    parts.push("");
    parts.push("Allow execution?");

    const choice = await ctx.ui.select(parts.join("\n"), ["No, block it", "Yes, allow once"], {
      default: "No, block it",
    });

    if (choice !== "Yes, allow once") {
      return {
        block: true,
        reason: `Blocked by user: ${rule.label} was denied`,
      };
    }

    // Allowed — pass through
    return;
  });

  // ── /perm command: show rules ──

  pi.registerCommand("perm", {
    description: "Show permission gate rules",
    handler: async (_args, ctx) => {
      const lines = [
        "🔐 Permission Gate — All patterns ask",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        ...RULES.map((r) => {
          const icon = "⚠️";
          return `  ${icon} ${r.label.padEnd(28)} ${r.pattern}`;
        }),
        "",
        `Environment: ${isProdEnvironment() ? "🚨 PROD" : "✅ non-prod"}`,
        "",
        "Use --skip-perm-gate flag to bypass for one command.",
      ].join("\n");

      ctx.ui.notify(lines, "info");
    },
  });
}
