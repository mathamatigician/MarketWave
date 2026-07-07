# GlobePulse — Developer Guide (for Collaborators)

**Who this is for:** `Ananya01Agrawal`, `SUNILMVVK`, `Keshawk025`, and any future team member with
**Write** access. This is a beginner guide — if you have never used Git before, start at Part 1 and
do every step in order.

**The one golden rule:** You never write code directly on `main` or `develop`. You always make your
own branch, push it, and open a Pull Request (PR). Someone reviews it, then it gets merged. That's it.

> **Words you'll see (plain-English glossary)**
> - **Repository / repo** = the project's folder of code on GitHub.
> - **Clone** = download a copy of the repo to your computer.
> - **Branch** = your own private copy of the code to work on, so you don't disturb others.
> - **Commit** = a saved snapshot of your changes with a short message.
> - **Push** = upload your commits to GitHub.
> - **Pull** = download the latest changes from GitHub to your computer.
> - **Pull Request (PR)** = a request to merge your branch into `develop`, where teammates review it.
> - **`main`** = the finished, production code. **`develop`** = where everyone's work is combined and tested.

---

## Part 1 — One-Time Setup (do this once per computer)

### 1.1 Install Git
- **Windows:** download from https://git-scm.com/download/win and run the installer (click Next through all defaults).
- **Mac:** open the **Terminal** app and type `git --version`. If it's not installed, a popup will offer to install it — click Install.

Check it worked (type this in Terminal / Git Bash and press Enter):
```bash
git --version
```
You should see something like `git version 2.4x.x`.

### 1.2 Tell Git who you are (use YOUR name and the email on your GitHub account)
```bash
git config --global user.name "Ananya Agrawal"
git config --global user.email "your-github-email@example.com"
```

### 1.3 Accept the invite & get access
The owner will send you a collaborator invite — check your email or
https://github.com/notifications and click **Accept invitation**. You now have Write access.

### 1.4 Download (clone) the project to your computer
Pick a folder where you keep projects, then:
```bash
# Go to your projects folder (example)
cd ~/Documents

# Download the repo (creates a "GlobePulse" folder)
git clone https://github.com/pravintakpire/GlobePulse.git

# Go into it
cd GlobePulse
```
The first time, GitHub will ask you to log in in your browser — do it. Done — you now have the code.

> If asked for a password on the command line, GitHub no longer accepts your account password.
> Easiest fix: install the **GitHub CLI** (https://cli.github.com), then run `gh auth login` once and
> follow the browser prompts. After that, cloning/pushing "just works."

---

## Part 2 — The Everyday Workflow (do this for EVERY task)

Follow these 6 steps every single time you build a feature or fix a bug. We'll use a real example:
**adding a "Manage Watchlist" button to the frontend.**

### Step 1 — Get the latest code and start from `develop`
```bash
# Move to the develop branch
git checkout develop

# Download everyone's latest changes
git pull origin develop
```

### Step 2 — Create your own branch
Name it `feature/short-description` (or `bugfix/short-description` for a fix).
```bash
git checkout -b feature/watchlist-button
```
✅ You are now on your own branch. Anything you do here does not affect anyone else.

### Step 3 — Do your work, then save it (commit)
Edit the code in your editor (e.g. VS Code). When you've made a meaningful chunk of progress:
```bash
# See what you changed
git status

# Stage ALL your changes to be saved
git add .

# Save a snapshot with a clear message (see message rules below)
git commit -m "feat(frontend): add Manage Watchlist button"
```
You can commit as many times as you like as you work. Commit often — small saves are good.

**Commit message format** (keep it short and descriptive):
```
type(area): what you did
```
Examples:
- `feat(frontend): add watchlist modal`
- `fix(backend): stop crash when price is NaN`
- `docs(readme): add setup instructions`

Common `type` values: `feat` (new feature), `fix` (bug fix), `docs` (docs), `refactor` (cleanup),
`test` (tests), `chore` (misc).

### Step 4 — Upload your branch (push)
```bash
git push -u origin feature/watchlist-button
```
(You only need the `-u origin ...` part the first push on a branch. After that, just `git push`.)

### Step 5 — Open a Pull Request (PR)
**Easiest way (in your browser):**
1. Go to https://github.com/pravintakpire/GlobePulse
2. You'll see a yellow banner: **"feature/watchlist-button had recent pushes — Compare & pull request"**. Click it.
3. **Very important:** make sure the **base** dropdown says **`develop`** (NOT `main`).
4. Write a title and description. Fill in this template in the description box:
   ```markdown
   ## Goal / Description
   Adds a "Manage Watchlist" button so users can add/remove stocks.

   ## Proposed Changes
   - frontend/src/components/DataWidgets.tsx — new button + modal

   ## Verification Plan
   Ran `npm run build` in /frontend — builds with no errors. Clicked the button locally, modal opens.
   ```
5. Click **Create pull request**.
6. On the right side, under **Reviewers**, request a teammate to review.

> **Prefer the command line?** After pushing (Step 4), run:
> ```bash
> gh pr create --base develop \
>   --title "feat: add Manage Watchlist button" \
>   --body "Adds a button to add/remove stocks. Ran npm run build - passes."
> ```
> (Requires the GitHub CLI from Part 1.4.)

### Step 6 — Get it reviewed and merged
- A teammate reviews. They may **approve** or **request changes**.
- If they request changes, fix them, then repeat: `git add .` → `git commit -m "..."` → `git push`.
  The PR updates automatically. (Note: pushing new changes cancels the previous approval — that's normal, ask for a re-review.)
- Once you have **1 approval** and all comment threads are resolved, click the green
  **Squash and merge** button on the PR page → **Confirm**.
- Click **Delete branch** when GitHub offers — keeps things tidy.

🎉 Your work is now in `develop`.

### Step 7 — Clean up on your computer (optional but tidy)
```bash
git checkout develop
git pull origin develop
git branch -d feature/watchlist-button
```

---

## Part 3 — Keeping Your Branch Up to Date

If you've been working on a branch for a while, other PRs may have merged into `develop`. Pull those
into your branch so you don't fall behind and to catch conflicts early:
```bash
# While on your feature branch
git fetch origin
git merge origin/develop
```
If Git reports a **conflict**, see Part 4.

---

## Part 4 — When Something Goes Wrong (don't panic)

### "Merge conflict!"
This means you and someone else changed the same lines. Git marks them like this in the file:
```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> origin/develop
```
1. Open each marked file in your editor.
2. Delete the `<<<<<<<`, `=======`, `>>>>>>>` lines and keep the correct final code.
3. Then:
   ```bash
   git add .
   git commit -m "fix: resolve merge conflict"
   git push
   ```
If you get stuck and want to bail out completely: `git merge --abort` puts you back where you started.

### "I committed to the wrong branch / oops"
Ask the owner before doing anything destructive. Usually nothing is lost — Git keeps history.

### "It won't let me push to main / develop"
That's **correct and intentional.** You cannot push directly to `main` or `develop`. Make a branch
and open a PR (Part 2).

### "It's asking for a password and rejects it"
Install GitHub CLI (https://cli.github.com) and run `gh auth login` once. See Part 1.4.

---

## Part 5 — Quick Reference Card (copy/paste)

```bash
# --- Start a new task ---
git checkout develop
git pull origin develop
git checkout -b feature/my-task

# --- Save progress (repeat as needed) ---
git add .
git commit -m "feat(area): what I did"

# --- Upload & open PR ---
git push -u origin feature/my-task
# then open PR in browser, base = develop, request a reviewer

# --- After review, on GitHub: click "Squash and merge" ---

# --- Clean up ---
git checkout develop
git pull origin develop
git branch -d feature/my-task
```

**The rules in one breath:** branch from `develop` → commit → push → PR into `develop` → get 1 approval
→ squash-merge → delete branch. Never touch `main` or `develop` directly.
