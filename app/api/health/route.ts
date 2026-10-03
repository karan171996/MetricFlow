import { readFileSync } from "node:fs";

export async function GET() {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../../package.json", import.meta.url), "utf8")
  );

  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: packageJson.version
  });
}