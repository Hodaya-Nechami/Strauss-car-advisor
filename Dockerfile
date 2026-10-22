# בניית האתר (apps/web) כתמונת Docker אחת, למונורפו עם npm workspaces.
# הרצה: docker compose up --build (ראו docker-compose.yml בשורש).
#
# שלב build-base/deps/build: כולל מהדר C כדי ש-better-sqlite3 (תלות של packages/data)
# יוכל להתקמפל מקוד אם אין בינארי מוכן לפלטפורמה. שלב runner: תמונה נקייה בלי כלי בנייה.

FROM node:20-bookworm-slim AS build-base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM build-base AS deps
# מעתיקים רק את קבצי package.json של כל סדנה, כדי ש-Docker ישמור על השכבה הזו
# במטמון כשרק קוד המקור משתנה, לא התלויות.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/package.json
COPY packages/agent/package.json packages/agent/package.json
COPY packages/data/package.json packages/data/package.json
COPY apps/web/package.json apps/web/package.json
# node-gyp (גיבוי אם better-sqlite3 לא מוצא בינארי מוכן) בורר כותרות Node מ-nodejs.org כברירת מחדל.
# הן כבר כלולות בתמונת הבסיס תחת /usr/local/include/node, אז מצביעים לשם במקום להוריד.
ENV npm_config_nodedir=/usr/local
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app /app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
