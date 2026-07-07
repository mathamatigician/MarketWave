# GlobePulse — GitHub Collaboration & Code Integrity Guide

This is the single source of truth for how the GlobePulse team branches, reviews, merges,
and releases code, and how repository access is managed to protect the codebase.

> **Audience:** all collaborators. Sections marked **(Owner/Admin)** require admin rights
> and are performed by the repository owner only.

**Repo:** `pravintakpire/GlobePulse` · **Visibility:** Public · **Default branch:** `main`

---

## 0. Current State & Setup Checklist (Owner/Admin)

Some rules below describe the **target** workflow. The items in this checklist are what still
needs to be configured on GitHub to make the rest of this document fully enforceable. Until
they are done, treat them as team convention rather than hard gates.

| # | Item | Status | Action |
| :-- | :--- | :--- | :--- |
| 1 | `main` protected (PR + 1 approval, stale dismissal, admins included, no force-push/delete) | ✅ Done | — |
| 2 | `develop` branch exists on remote | ✅ Done | — |
| 3 | `develop` branch protection (PR + 1 approval, stale dismissal, conversation resolution, admins included, no force-push/delete) | ✅ Done | — |
| 4 | `Require conversation resolution` on `main` | ✅ Done | — |
| 5 | Auto-delete head branches after merge | ✅ Done | — |
| 6 | Merge method = Squash only (merge-commit & rebase disabled) | ✅ Done | — |
| 7 | `.github/CODEOWNERS` | ⏸️ On hold | Optional file — takes effect only once committed to the repo, see **§6** |
| 8 | CI status checks (build/lint) | ⏸️ On hold | Optional file — takes effect only once committed to the repo, see **§7** |

### §0.1 Create and publish the `develop` branch (one-time)

```bash
# From an up-to-date main, create develop and push it
git checkout main
git pull origin main
git checkout -b develop
git push -u origin develop
```

Then set `develop` as the **default PR base** (optional but recommended):
Settings → General → *Default branch* — or simply always target `develop` when opening PRs.

### §0.2 Protect `develop` (Owner/Admin, GitHub UI)

Settings → **Branches** → **Add branch ruleset / rule** → pattern `develop`:
- ✅ Require a pull request before merging → Require approvals: **1**
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require conversation resolution before merging
- ✅ Block force pushes
- (Later) ✅ Require status checks to pass → select CI checks once §7 exists

---

## 1. Roles, Access & Integrity Model

### 1.1 Who has what (current)

| Member | GitHub Role | Capabilities |
| :--- | :--- | :--- |
| `pravintakpire` (Owner) | **Admin** | Full control: settings, protection rules, manage collaborators, releases |
| `Ananya01Agrawal` | **Write** | Create branches, push to non-protected branches, open & merge approved PRs, triage issues |
| `SUNILMVVK` | **Write** | Same as above |
| `Keshawk025` | **Write** | Same as above |

### 1.2 GitHub permission levels (reference for enabling/restricting people)

| Level | Grants | Use for |
| :--- | :--- | :--- |
| **Read** | Clone, open issues, comment | Reviewers/observers, stakeholders |
| **Triage** | Read + manage issues/PRs (no code write) | QA / PM without push rights |
| **Write** | Triage + push to unprotected branches, merge approved PRs | **Default for developers** |
| **Maintain** | Write + manage some settings (not sensitive) | Trusted lead |
| **Admin** | Everything incl. protection & access | **Owner only** |

**Principle of least privilege:** keep developers at **Write**. Do not hand out **Admin** —
protected-branch rules are only meaningful if the number of people who can bypass/change them
is minimal. With `enforce_admins` ON, even the owner must use PRs, which is the desired behavior.

### 1.3 Enable / restrict a collaborator (Owner/Admin)

- **Add:** Settings → **Collaborators** → *Add people* → enter GitHub handle → choose **Write**.
- **Change role:** Settings → Collaborators → click the member → adjust role.
- **Restrict / remove:** Settings → Collaborators → **Remove**. Removing a collaborator
  immediately revokes push access; their existing merged commits remain in history.
- **CLI equivalents:**
  ```bash
  # Invite with write permission
  gh api -X PUT repos/pravintakpire/GlobePulse/collaborators/<handle> -f permission=push
  # Downgrade to read-only
  gh api -X PUT repos/pravintakpire/GlobePulse/collaborators/<handle> -f permission=pull
  # Remove entirely
  gh api -X DELETE repos/pravintakpire/GlobePulse/collaborators/<handle>
  ```

### 1.4 How codebase integrity is protected

1. **No direct commits to `main`** (and `develop` once protected) — all change flows through PRs.
2. **Peer review gate** — ≥1 approval required; approvals are dismissed if new commits are pushed.
3. **Admins included** — `enforce_admins` is ON, so no one bypasses review.
4. **No force-push, no branch deletion** on protected branches — history cannot be rewritten.
5. **Least-privilege access** — developers are Write, not Admin.
6. **Secrets never committed** — use `.env` (git-ignored); never push API keys/tokens. If a secret
   is committed, rotate it immediately and notify the owner.

---

## 2. Branching Strategy & Naming

We use a trimmed Git Flow: two long-lived branches plus short-lived work branches.

| Branch | Role | Protection |
| :--- | :--- | :--- |
| `main` | Production / release-ready code only | **Protected** — PR + review, no direct/force push |
| `develop` | Integration branch; all feature work merges here first | **Protected** (after §0.2) — PR + review |
| `feature/*`, `bugfix/*` | Short-lived work branches off `develop` | Author pushes freely; deleted after merge |
| `hotfix/*` | Emergency production fix off `main` | Deleted after merge |

### Naming patterns
- **Feature:** `feature/GP-101-watchlist-modal`
- **Bugfix:** `bugfix/GP-144-pricing-nan`
- **Hotfix:** `hotfix/price-crash` (from `main`, merged to `main` **and** `develop`)

Use a short ticket/issue id when one exists; otherwise a concise kebab-case description.

---

## 3. Pull Request Lifecycle

### Step 1 — Sync, then branch off `develop`
```bash
git checkout develop
git pull origin develop
git checkout -b feature/GP-101-watchlist-modal
```

### Step 2 — Open the PR **targeting `develop`**
Every PR description must include:
```markdown
## Goal / Description
What problem does this solve, and the core approach?

## Proposed Changes
- Files added/modified
- Any architectural or schema changes

## Verification Plan
Commands run to verify (e.g. `npm run build`, `pytest`), and results.

## Related Issue
Closes #<id>
```

### Step 3 — Checks (once CI exists, §7)
Lint/format, build/compile, and unit tests must be green before merge. Until CI is set up,
the author confirms these locally in the **Verification Plan**.

---

## 4. Code Review & Approval

- **Minimum approvals:** **1** for standard PRs; **2** for core/security-sensitive changes
  (auth, database schema, pipeline, payment/pricing logic).
- **Reviewer:** at least one *other* developer — you may not approve your own PR.
- **Stale approvals:** any push after approval dismisses it; a re-review is required.
- **Turnaround:** review open PRs within **24 hours** of being requested.
- **Resolve threads:** all review comments must be resolved before merge.

Review focus: correctness & edge cases, readability & naming, security (no secrets, safe queries),
and no obvious performance regressions.

---

## 5. Merging Guidelines

- **Method: Squash and merge** — the team default. One clean commit per PR keeps `develop`
  and `main` linear and readable. (Owner should disable merge-commit & rebase-merge in
  Settings → General to enforce squash-only.)
- **Merge authority:** the **PR author** merges *after* approval(s) and green checks.
- **Release PRs (`develop` → `main`):** merged by the **Owner/Lead** only.
- **Cleanup:** enable auto-delete of head branches (checklist #5); delete local branches after merge.

The squash commit title should follow Conventional Commits, e.g.
`feat(frontend): watchlist management modal` or `fix(backend): handle NaN in serialization`.

---

## 6. CODEOWNERS (Optional, Owner/Admin)

Auto-requests reviews from owners of touched paths. Create `.github/CODEOWNERS`:
```text
# Fallback reviewer for everything
*              @pravintakpire

# Area owners (adjust handles as the team specializes)
/backend/      @pravintakpire
/frontend/     @pravintakpire
```
Then enable *Require review from Code Owners* in the branch rule.

---

## 7. CI Status Checks (Optional but Recommended, Owner/Admin)

There is currently **no CI**, so "checks must pass" cannot be enforced yet. To add it, create
`.github/workflows/ci.yml` that runs frontend build + backend tests on every PR, then in the
`main`/`develop` protection rules enable **Require status checks to pass** and select those jobs.
Minimal starting point:
```yaml
name: CI
on:
  pull_request:
    branches: [develop, main]
jobs:
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci && npm run build
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: cd backend && pip install -r requirements.txt && pytest -q || true
```

---

## 8. Developer Git CLI Reference

### A. Start work (off `develop`)
```bash
git checkout develop && git pull origin develop
git checkout -b feature/GP-101-watchlist-modal
```

### B. Commit (Conventional Commits)
```bash
git add .
git commit -m "feat(frontend): implement watchlist management modal"
```

### C. Keep your branch current before opening/updating a PR
```bash
git fetch origin
git rebase origin/develop      # resolve conflicts, then: git add <files> && git rebase --continue
```
> Only rebase your **own** unshared branch. Never rebase `main`/`develop`.

### D. Push & open the PR
```bash
git push -u origin feature/GP-101-watchlist-modal
gh pr create --base develop --head feature/GP-101-watchlist-modal \
  --title "feat: watchlist management modal" \
  --body "Adds a Manage Watchlist modal to track equities dynamically."
```

### E. Update PR after review
```bash
git add . && git commit -m "fix: align checkmarks in Safari"
git push origin feature/GP-101-watchlist-modal   # PR updates automatically; re-review required
```

### F. Post-merge cleanup (local)
```bash
git checkout develop && git pull origin develop
git branch -d feature/GP-101-watchlist-modal
git remote prune origin
```

---

## 9. Release & Hotfix (Owner/Lead)

> **Important:** `main` is protected and blocks direct pushes **for everyone, including admins**.
> Releases and hotfixes reach `main` **through a Pull Request**, never a local `git push origin main`.

### A. Production release (`develop` → `main`)
```bash
git checkout develop && git pull origin develop
# Open a release PR from develop into main:
gh pr create --base main --head develop \
  --title "release: v1.1.0" \
  --body "Promote validated develop to production."
# After approval, squash/merge the PR in the GitHub UI, then tag the merge commit on main:
git checkout main && git pull origin main
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

### B. Production hotfix (emergency)
```bash
# 1. Branch off main
git checkout main && git pull origin main
git checkout -b hotfix/price-crash
git add . && git commit -m "fix(backend): resolve NaN serialization crash"
git push -u origin hotfix/price-crash

# 2. PR the hotfix into main, get approval, squash-merge in UI, then tag:
gh pr create --base main --head hotfix/price-crash --title "fix: NaN serialization crash" --body "Emergency production fix."
git checkout main && git pull origin main
git tag -a v1.1.1 -m "Hotfix v1.1.1" && git push origin v1.1.1

# 3. Bring the fix back into develop via a second PR (keep branches in sync):
gh pr create --base develop --head hotfix/price-crash --title "fix: sync hotfix v1.1.1 to develop" --body "Backport hotfix."
```

Versioning follows **SemVer**: `MAJOR.MINOR.PATCH` (breaking / feature / fix).

---

## 10. Quick Rules Cheat-Sheet

- Branch from `develop`; PR back into `develop`.
- Never commit to `main`/`develop` directly. Never force-push them.
- 1 approval min (2 for core/security). You can't approve your own PR.
- Squash-merge; delete the branch after.
- Releases and hotfixes reach `main` via PR only, then tag.
- Keep secrets in `.env`; rotate immediately if leaked.
- Developers stay at **Write**; only the owner is **Admin**.
