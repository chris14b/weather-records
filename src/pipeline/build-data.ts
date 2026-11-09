import { locationById } from "../shared/locations.ts";
import { buildFactsFile, factsPath, writeFactsFile } from "./facts-file.ts";
import { connectToBom } from "./ftp.ts";
import { factLine } from "./print.ts";

const ftp = connectToBom();
try {
  const file = await buildFactsFile({ ftp, now: new Date() });
  await writeFactsFile(factsPath, file);

  console.log(`Wrote ${factsPath} at ${file.generatedAt}`);
  for (const { locationId, forecast, ...sections } of file.locations) {
    console.log(`\n${locationById(locationId).name}`);
    const [today] = forecast;
    if (today !== undefined) {
      console.log(`  forecast ${today.date}: ${today.precis ?? "no précis"}`);
    }
    for (const [section, facts] of Object.entries(sections)) {
      console.log(`  ${section}:`);
      for (const fact of facts) console.log(`    ${factLine(fact)}`);
    }
  }
} finally {
  ftp.close();
}
