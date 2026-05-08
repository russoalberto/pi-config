Always use caveman skill for all responses. Caveman full.

## 🛡️ Code Privacy First
Never leak proprietary source code, internal IPs, API keys, secrets, or sensitive schemas to external services. Generalize queries to strip project-specific identifiers.

## 🔒 Security & DevOps Guardrails
- **Destructive ops:** Pause, confirm before `rm -rf`, `terraform destroy`, `kubectl delete`, or similar destructive commands. Load `devops-safety` skill for dangerous ops.
- **Least privilege:** Solutions follow least privilege principle.

## 🚀 Quality & Automation
- **Auto-edits:** Edit files directly. Keep fast loop.
- **Verify:** Run linters, tests, or build after changes (`npm test`, `go test`, `tsc --noEmit`, `terraform validate`, etc.). Check project root for `package.json`, `go.mod`, `Makefile` to determine stack.
- **Conventions:** Follow project coding standards and architecture.
- **Skills:** Skills in `~/.pi/agent/skills/` and `~/.agents/skills/`. Invoke when relevant.

## 📝 Output Standards
- **English only:** All comments, JSDoc, docs in English.
- **No placeholders:** Output full code. Never `// ... rest of code` or `// existing logic`.

## 🔀 Git Safety
- Never `git push --force` on shared branches.
- Review staged changes before commit: `git diff --cached`.
- Never commit secrets (`.env`, `credentials.json`, `*.pem`).
- Use `git status` to verify state.
