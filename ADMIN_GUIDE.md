# GlobePulse — Admin / Owner Guide

**Who this is for:** the repository owner (`pravintakpire`). This covers the things only an admin can
do: managing who has access, protecting branches, configuring merge/PR settings, reviewing & merging
releases, and handling emergencies. Written for someone new to GitHub — every step has both the
**click-path** (in the GitHub website) and the **command line** version. Use whichever you prefer.

**Repo home page:** https://github.com/pravintakpire/GlobePulse
**Settings page:** https://github.com/pravintakpire/GlobePulse/settings

> **Current status (already configured):**
> - `main` — protected: PR + 1 approval, dismiss stale approvals, admins included, no force-push/delete. ✅
> - `develop` — protected: PR + 1 approval, dismiss stale approvals, conversation resolution, admins included, no force-push/delete. ✅
> - Collaborators: `Ananya01Agrawal`, `SUNILMVVK`, `Keshawk025` — all **Write**. ✅

---

## Part 1 — Managing People (Add / Restrict / Remove)

### Understand the access levels (pick the least powerful one that works)
| Level | What they can do | Give it to |
| :--- | :--- | :--- |
| **Read** | View & clone, comment on issues | Observers, stakeholders |
| **Triage** | Read + manage issues/PRs, no code push | QA/PM without coding |
| **Write** | Push branches, open & merge approved PRs | **Your developers (default)** |
| **Maintain** | Write + some settings | A trusted co-lead |
| **Admin** | Everything, incl. settings & access | **You only** |

> **Rule of thumb:** keep developers at **Write**. Only you should be **Admin**. Branch protection
> only means something if very few people can change it.

### 1.1 Add a collaborator
**Click-path:**
1. Go to https://github.com/pravintakpire/GlobePulse/settings/access
2. Click **Add people** (green button).
3. Type their GitHub username → select them → choose **Write** → **Add**.
4. They receive an email invite and must click **Accept**.

**Command line:**
```bash
# Invite someone with Write (push) access
gh api -X PUT repos/pravintakpire/GlobePulse/collaborators/THEIR_USERNAME -f permission=push
```
Example — invite a new dev named `priya-dev`:
```bash
gh api -X PUT repos/pravintakpire/GlobePulse/collaborators/priya-dev -f permission=push
```

### 1.2 Change someone's access level
**Click-path:** Settings → Collaborators → click the person → pick a new role.

**Command line:**
```bash
# Downgrade to read-only (they can view but no longer push)
gh api -X PUT repos/pravintakpire/GlobePulse/collaborators/THEIR_USERNAME -f permission=pull
```
`permission` values: `pull` (Read), `triage`, `push` (Write), `maintain`, `admin`.

### 1.3 Restrict or remove someone
**Click-path:** Settings → Collaborators → find the person → **Remove**.

**Command line:**
```bash
gh api -X DELETE repos/pravintakpire/GlobePulse/collaborators/THEIR_USERNAME
```
Removing them instantly revokes push access. Code they already merged stays in history (that's fine).

### 1.4 See who currently has access
**Command line:**
```bash
gh api repos/pravintakpire/GlobePulse/collaborators --jq '.[] | "\(.login) — \(.role_name)"'
```
Example output:
```
pravintakpire — admin
Ananya01Agrawal — write
SUNILMVVK — write
Keshawk025 — write
```

---

## Part 2 — Protecting Branches (Keeping the Code Safe)

This is the heart of "code integrity." Protected branches cannot be pushed to directly — everything
must go through a reviewed PR. **Both `main` and `develop` are already protected**; this section is so
you understand and can adjust the settings.

### What each setting means (in plain English)
| Setting | What it does | We set it to |
| :--- | :--- | :--- |
| Require a pull request before merging | No direct pushes; must use a PR | ON |
| Require approvals | At least N teammates must approve | 1 |
| Dismiss stale approvals | New pushes cancel old approvals → forces fresh review | ON |
| Require conversation resolution | All review comments must be resolved | ON (develop) |
| Do not allow bypassing (include admins) | Even you must follow the rules | ON |
| Allow force pushes | Lets people rewrite history (dangerous) | OFF |
| Allow deletions | Lets people delete the branch | OFF |

### 2.1 View or edit protection (Click-path)
1. Go to https://github.com/pravintakpire/GlobePulse/settings/branches
2. Under **Branch protection rules**, click **Edit** next to `main` or `develop`.
3. Toggle checkboxes as needed → scroll down → **Save changes**.

### 2.2 Check protection from the command line
```bash
# Quick summary of develop's rules
gh api repos/pravintakpire/GlobePulse/branches/develop/protection \
  --jq '{approvals: .required_pull_request_reviews.required_approving_review_count,
         dismiss_stale: .required_pull_request_reviews.dismiss_stale_reviews,
         convo_resolution: .required_conversation_resolution.enabled,
         admins_enforced: .enforce_admins.enabled,
         force_push: .allow_force_pushes.enabled}'
```

### 2.3 (Optional) Turn on conversation resolution for `main` too
Right now `develop` has it but `main` doesn't. To make them match:
**Click-path:** Settings → Branches → Edit `main` → check **Require conversation resolution before
merging** → Save.

---

## Part 3 — Repository Settings You Should Turn On

> **Status: already configured.** These settings are ON. This section explains what they do and how
> to check/change them. They can be set either in the website **or** from the command line.

**Click-path:** https://github.com/pravintakpire/GlobePulse/settings → scroll to the **Pull Requests** section.

1. ✅ **Allow squash merging** — keep this ON. Uncheck **Allow merge commits** and **Allow rebase
   merging** to force clean, one-commit-per-PR history (our team standard).
2. ✅ **Automatically delete head branches** — check this so feature branches vanish after their PR
   merges. Keeps the branch list clean.

**Command line (equivalent of both settings above):**
```bash
gh api -X PATCH repos/pravintakpire/GlobePulse \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true
```
Check the current values anytime:
```bash
gh api repos/pravintakpire/GlobePulse \
  --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, delete_branch_on_merge}'
```

*(Optional)* Set the default branch developers land on. Settings → General → **Default branch** →
switch to `develop` if you want new PRs to target it by default. Leaving it as `main` is also fine —
developers just pick `develop` as the base when opening a PR.

---

## Part 4 — Reviewing and Merging PRs

When a developer opens a PR, you (or another dev) review it.

### 4.1 Review in the browser
1. Go to https://github.com/pravintakpire/GlobePulse/pulls
2. Click the PR. Read the description. Click the **Files changed** tab to see the code.
3. Click **Review changes** (top right) → choose:
   - **Approve** — looks good.
   - **Request changes** — needs fixes (leave comments explaining what).
   - **Comment** — general feedback, no verdict.
4. Once it has 1 approval and all comment threads are resolved, click the green
   **Squash and merge** → **Confirm squash and merge** → **Delete branch**.

### 4.2 Review from the command line (optional)
```bash
# See open PRs
gh pr list

# Read a PR (by its number, e.g. 7)
gh pr view 7

# Look at the actual code changes
gh pr diff 7

# Approve it
gh pr review 7 --approve

# Merge it (squash) and delete the branch
gh pr merge 7 --squash --delete-branch
```

---

## Part 5 — Releasing to Production (`develop` → `main`)

When `develop` is tested and ready, you promote it to `main`. **You cannot push to `main` directly**
(protection blocks it, even for you) — you do it through a PR, then tag the version.

### Step 1 — Open a release PR
```bash
gh pr create --base main --head develop \
  --title "release: v1.0.0" \
  --body "Promote tested develop to production."
```
*(Or in the browser: New pull request → base `main`, compare `develop` → Create.)*

### Step 2 — Approve & merge it
Merge the PR in the browser (**Squash and merge**) or:
```bash
gh pr merge --squash   # run while that PR is checked out/selected
```

### Step 3 — Tag the version (marks this exact release point)
```bash
git checkout main
git pull origin main
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```
**Version numbers (SemVer):** `MAJOR.MINOR.PATCH`
- `v1.0.0` → `v1.0.1` = a small bug fix
- `v1.0.0` → `v1.1.0` = new features, nothing broken
- `v1.0.0` → `v2.0.0` = big/breaking changes

---

## Part 6 — Emergency Hotfix (bug in production, `main`)

Something is broken in the live product and can't wait for the normal flow.
```bash
# 1. Branch off main
git checkout main
git pull origin main
git checkout -b hotfix/login-crash

# 2. Fix it, then save and upload
git add .
git commit -m "fix(auth): stop crash on empty login"
git push -u origin hotfix/login-crash

# 3. PR the fix into main, approve, and squash-merge (browser or CLI)
gh pr create --base main --head hotfix/login-crash \
  --title "fix: login crash" --body "Emergency production fix."
# ...approve & merge in the browser...

# 4. Tag the patched version
git checkout main && git pull origin main
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git push origin v1.0.1

# 5. IMPORTANT: also send the fix back into develop so it isn't lost
gh pr create --base develop --head hotfix/login-crash \
  --title "fix: sync hotfix v1.0.1 into develop" --body "Backport hotfix."
# ...approve & merge...
```

---

## Part 7 — Admin Quick Reference

```bash
# WHO HAS ACCESS
gh api repos/pravintakpire/GlobePulse/collaborators --jq '.[] | "\(.login) — \(.role_name)"'

# ADD / CHANGE / REMOVE a person
gh api -X PUT    repos/pravintakpire/GlobePulse/collaborators/USER -f permission=push   # add as Write
gh api -X PUT    repos/pravintakpire/GlobePulse/collaborators/USER -f permission=pull   # make read-only
gh api -X DELETE repos/pravintakpire/GlobePulse/collaborators/USER                      # remove

# REVIEW / MERGE PRs
gh pr list
gh pr view 7
gh pr review 7 --approve
gh pr merge 7 --squash --delete-branch

# RELEASE
gh pr create --base main --head develop --title "release: v1.0.0" --body "Promote develop."
# (merge in browser, then:)
git checkout main && git pull origin main
git tag -a v1.0.0 -m "Release v1.0.0" && git push origin v1.0.0
```

**Your job in one line:** manage access (keep devs at Write), keep `main`/`develop` protected,
review & squash-merge PRs, and cut releases via PR + tag.
