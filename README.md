# pi-config

Personal [pi](https://github.com/earendil-works/pi-mono) coding agent configuration with global skills.

## 🛡️ Core Design Principles

### 1. Code Privacy First
Never leak proprietary source code, internal IPs, API keys, or sensitive schemas to external services. External searches are generalized to strip project-specific identifiers.

### 2. Security & DevOps Guardrails
- **Least privilege** — solutions follow least privilege principle.
- **Destructive ops** — pause and confirm before `rm -rf`, `terraform destroy`, `kubectl delete`, etc.
- **Infrastructure awareness** — treat `.tfstate`, `kubeconfig`, etc. with extreme caution.

### 3. Quality & Automation
- **Auto-edits** — edit files directly, keep fast loop.
- **Verify** — run linters, tests, or build after changes.
- **Conventions** — follow project coding standards and architecture.
- **No placeholders** — output full code, never `// ... rest of code`.

## 📁 Structure

```
~/.pi/agent/
├── AGENTS.md          # Project-level agent instructions (injected every session)
├── README.md          # This file
├── extensions/        # Custom TypeScript extensions (RTK, permission gate, review)
├── settings.json      # Base settings (theme, provider, packages)
├── skills/            # Symlinks to installed skills
└── themes/            # Custom themes (gruvbox-dark)
```

## Setup

```bash
git clone git@github.com:russoalberto/pi-config.git ~/.pi/agent
```

## 🌐 Global Skills

Skills are loaded from `~/.agents/skills/` and provide structured workflows for common development tasks. They follow a standardized format with triggering conditions, quick reference tables, non-negotiable rules, and cross-references.

### Superpowers (obra/superpowers)

| Skill | Trigger Keywords |
| :--- | :--- |
| 🧠 **brainstorming** | Before creative work, features, components, architecture |
| 🧠 **dispatching-parallel-agents** | 2+ independent tasks without shared state |
| 🧠 **executing-plans** | Written implementation plan to execute |
| 🧠 **finishing-a-development-branch** | Implementation complete, merge/PR/cleanup decisions |
| 🧠 **receiving-code-review** | Code review feedback before implementing suggestions |
| 🧠 **requesting-code-review** | Before merging, verify work meets requirements |
| 🧠 **subagent-driven-development** | Implementation plans with independent subagent tasks |
| 🧠 **systematic-debugging** | Bugs, test failures, unexpected behavior |
| 🧠 **test-driven-development** | Red-green-refactor before implementation code |
| 🧠 **using-git-worktrees** | Feature work needing isolation |
| 🧠 **using-superpowers** | Conversation start — skill discovery |
| 🧠 **verification-before-completion** | Before claiming work is complete |
| 🧠 **writing-plans** | Multi-step task spec/requirements |
| 🧠 **writing-skills** | Creating, editing, or verifying skills |

### Domain Skills (russoalberto/skills)

| Skill | Use When |
| :--- | :--- |
| 🛡️ **devops-safety** | Destructive commands, production environments, critical systems |
| 🔒 **security-auditor** | Code vulnerabilities, auth implementation, security posture |
| ⚙️ **backend-architect** | API design, backend architecture, service boundaries |
| 🗄️ **database-expert** | Query optimization, schema design, migrations, storage choices |
| 🚀 **cicd-automation** | CI/CD pipelines, containerization, deployment automation |
| 🎨 **frontend-expert** | UI components, frontend performance, responsive design |
| ☁️ **cloud-infrastructure** | Cloud resources, network topology, Terraform/OpenTofu |
| 📊 **sre-observability** | Monitoring, SLOs, incident investigation, observability |

### Community Skills (skills.sh)

| Skill | Source | Description |
| :--- | :--- | :--- |
| 🗂️ **find-skills** | skills.sh | Discover and install agent skills |
| 📐 **terraform-style-guide** | hashicorp/agent-skills | Official HashiCorp Terraform HCL style |
| ☸️ **k8s-manifest-generator** | wshobson/agents | Production-ready Kubernetes manifests |
| 🔗 **api-design-principles** | wshobson/agents | REST/GraphQL API design patterns |

### Caveman Skills (token-optimized communication)

| Skill | Description |
| :--- | :--- |
| 🦴 **caveman** | Ultra-compressed mode (~75% token reduction). Supports `lite`, `full`, `ultra`, `wenyan` |
| 📝 **caveman-commit** | Ultra-compressed Conventional Commits (subject ≤50 chars) |
| ℹ️ **caveman-help** | Quick-reference card for all caveman modes and commands |
| 📊 **caveman-stats** | Real token usage and savings from Claude Code session log |
| 🤖 **cavecrew** | Subagent delegation — investigator/builder/reviewer with 60% compressed output |

### Skill Dependencies

```
cloud-infrastructure ──REQUIRED──▶ devops-safety (destructive commands, --force flags)
cloud-infrastructure ──REQUIRED──▶ security-auditor (IAM policy and network security review)
devops-safety        ──REQUIRED──▶ cloud-infrastructure (impact analysis for destructive actions)
security-auditor     ──REQUIRED──▶ cloud-infrastructure (IAM and network security review)
```

All other cross-references are **RECOMMENDED** (enhancement, non-blocking). Skills stay under ~550 words each.

### Install Commands

```bash
npx skills add obra/superpowers -g -y
npx skills add russoalberto/skills -g -y
npx -y skills add JuliusBrussee/caveman -a opencode
npx -y skills add vercel-labs/skills@find-skills -g -y
npx skills add hashicorp/agent-skills@terraform-style-guide -g -y
npx skills add wshobson/agents@k8s-manifest-generator -g -y
npx skills add wshobson/agents@api-design-principles -g -y
```

## 🚀 Usage

Skills auto-discover via their `Use when...` description triggers. Prompt implicitly or explicitly:

- **Implicit:** *"Design an API for user management."* (matches `backend-architect`)
- **Implicit:** *"Our Docker images are too large."* (matches `cicd-automation` symptoms)
- **Explicit:** *"Act as my `cloud-infrastructure` expert and review this Terraform module."*
- **Cross-Skill:** *"Run `tofu destroy` on this module."* (loads `devops-safety` → requires `cloud-infrastructure`)

## ✅ Validation

```bash
npx skills check
```

## License

MIT
