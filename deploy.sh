#!/bin/bash
set -e

export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"

cd "$(dirname "$0")"

echo "=== VISIO Photography — Deploy ==="
echo ""

# 1. Build
echo "→ Building..."
npm run build

# 2. GitHub (if not logged in, will prompt)
if ! gh auth status &>/dev/null; then
  echo "→ GitHub login required..."
  gh auth login
fi

# 3. Create repo & push (skip if remote already exists)
if ! git remote get-url origin &>/dev/null; then
  echo "→ Creating GitHub repo..."
  gh repo create visio-photography --public --source=. --remote=origin --push
else
  echo "→ Pushing to GitHub..."
  git push -u origin main
fi

# 4. Vercel deploy
if ! vercel whoami &>/dev/null; then
  echo "→ Vercel login required..."
  vercel login
fi

echo "→ Deploying to production..."
vercel --prod --yes

echo ""
echo "✓ Done! Your site is live."
