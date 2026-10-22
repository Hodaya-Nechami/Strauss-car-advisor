#!/bin/sh
# בלי disk מתמיד (Render free plan), מאגר שווי השימוש לא שורד restart.
# מייבא אותו מחדש מה-CSV בכל עליה של הקונטיינר אם הוא חסר, לפני שמריצים את האתר.
set -e

DB_PATH="${DB_PATH:-/app/.data/value-of-use.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "value-of-use.db not found at $DB_PATH, importing..."
  npm run data:import
fi

exec npm run start -w apps/web
