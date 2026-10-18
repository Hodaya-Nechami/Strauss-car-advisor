/** @type {import('next').NextConfig} */
const nextConfig = {
  // חבילות המנוע והבוט כתובות ב-TypeScript ונטענות ישירות מהמונורפו
  transpilePackages: ["@strauss/agent", "@strauss/engine"],
};

export default nextConfig;
