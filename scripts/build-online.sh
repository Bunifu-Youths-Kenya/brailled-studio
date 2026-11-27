#!/bin/sh
# Builds the online editor, the one with accounts, into online-site/playground/. Nothing is published.
#
# The editor links to the code it was built from, so changes must be committed first. To try a build of
# uncommitted changes on this computer, set ALLOW_UNCOMMITTED=1; never publish such a build.
set -eu
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ] && [ -z "${ALLOW_UNCOMMITTED:-}" ]; then
    echo "There are uncommitted changes. Commit them, or set ALLOW_UNCOMMITTED=1 for a local trial." >&2
    exit 1
fi
commit=$(git rev-parse HEAD)
source_url="https://github.com/Bunifu-Youths-Kenya/brailled-studio/tree/$commit"
built=packages/scratch-gui/build-online
site=online-site/playground

rm -rf "$built" "$site"
# The storage library finds its worker by how it was built, so it is built again from this commit.
(cd packages/scratch-storage && npx webpack --mode=production)
(
    cd packages/scratch-gui
    NODE_ENV=production BRAILLED_ONLINE=1 BRAILLED_SOURCE="$source_url" \
        NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}" npx webpack
)

# Only what the editor, the account page and the privacy page load.
mkdir -p "$site"
for name in index.html account.html privacy.html gui.js account.js gui.js.LICENSE.txt account.js.LICENSE.txt \
    extension-worker.js chunks static; do
    if [ -e "$built/$name" ]; then cp -r "$built/$name" "$site/"; fi
done
find "$site" -name '*.map' -delete
cp LICENSE "$site/LICENSE.txt"

for name in index.html account.html privacy.html gui.js account.js static/brailled-config.json \
    static/brailled-account.json; do
    [ -s "$site/$name" ] || { echo "The build lacks $name." >&2; exit 1; }
done
grep -q '"account": true' "$site/static/brailled-config.json" ||
    { echo "The build does not have the online configuration." >&2; exit 1; }
# The editor is served from a directory, so nothing may be looked for at the root of the website.
if grep -qE '\.p="/[^"]*"' "$site/gui.js"; then
    echo "The build looks for files at the root of the website, so it would not work in /playground/." >&2
    exit 1
fi
# Secret keys must never reach a browser.
if grep -rlE 'sb_secret_[A-Za-z0-9]|sk-or-v1-[A-Za-z0-9]|sk-proj-[A-Za-z0-9]|GOCSPX-[A-Za-z0-9]' "$site"; then
    echo "The files above seem to hold a secret key. Do not publish this build." >&2
    exit 1
fi

echo "Built $site from $commit"
if ! git branch -r --contains "$commit" | grep -q .; then
    echo "Push this commit before publishing, or the source code link leads nowhere."
fi
echo "Largest files:"
find "$site" -type f -exec du -k {} + | sort -rn | head -3
du -sh "$site"
