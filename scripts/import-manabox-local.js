import "dotenv/config";
import { readFile } from "node:fs/promises";

const filename = process.argv[2];
if (!filename) {
  console.error("Usage: node scripts/import-manabox-local.js <collection.csv>");
  process.exitCode = 1;
} else {
  try {
    const [{ importCollection }, csv] = await Promise.all([
      import("../lib/collection/imports/import-service.js"), readFile(filename, "utf8")
    ]);
    const result = await importCollection({ csvText: csv, source: "manabox", filename, confirmed: true });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
