# Rename The Repository And Local Folder

The requested target is **MIPRO_ERP**. No repository or folder has been renamed by this update. Do this when local servers and editors are closed; the current workspace contains a linked prototype checkout.

Renaming does not require a new database, new Vercel projects, a data migration or different login accounts. Keep the existing Supabase references, Vercel project IDs, domains and private environment filenames.

## 1. Rename On GitHub

Open `AN-SWAPNIL/Medical_Supplier_ERP` -> **Settings -> General -> Repository name**, enter `MIPRO_ERP`, and select **Rename**. GitHub retains repository history and redirects the old repository URL, but recommends updating local remotes. Do not reuse the old name for another repository. [GitHub instructions](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository).

## 2. Update The Remote

From the existing local project:

```powershell
git remote set-url origin https://github.com/AN-SWAPNIL/MIPRO_ERP.git
git remote -v
git fetch origin
```

The linked prototype worktree shares this remote, so do not create another repository or copy its `.git` directory.

## 3. Update The Connection Label

Change only `repository` in `config/environments.json` to `AN-SWAPNIL/MIPRO_ERP`, preserving `repositoryId`. Commit/promote this small configuration update through `dev` and `main`. The deployment audit now verifies the immutable repository ID, not its old name, so existing connections tolerate a rename. The label is still needed if a Vercel project is reconnected later.

In Vercel, check **Settings -> Git** for all three projects. Verify that they reference the renamed repository and retain their production branches (`prototype`, `dev`, `main`). If Vercel still shows the old name or Git-triggered deployment stops, reconnect the same renamed repository; do not create new projects or alter secrets. Audit without changes:

```powershell
node scripts/configure-branch-deployments.mjs
```

## 4. Rename The Local Folder

Stop local servers, close editors/terminals rooted in the project, then run from a separate PowerShell window:

```powershell
Set-Location -LiteralPath 'D:\Codes\Projects'
Rename-Item -LiteralPath 'D:\Codes\Projects\Medical_Supplier' -NewName 'MIPRO_ERP'
Set-Location -LiteralPath 'D:\Codes\Projects\MIPRO_ERP'
git worktree repair 'D:/Codes/Projects/MIPRO_ERP/artifacts/worktrees/prototype'
git worktree list
git status
npm run check:environment
```

Do not overwrite an existing `MIPRO_ERP` directory. `git worktree repair` repairs the moved main/prototype checkout links; never edit or replace `.git` files manually. [Git worktree documentation](https://git-scm.com/docs/git-worktree).

Reopen the renamed directory in your editor and restart using `npm run dev`. Source paths and private environment paths are repository-relative. Generated build caches can be rebuilt if needed; keep credentials, backups and release/recovery evidence. Internal npm package names do not need to change for this rename.
