import { locationById } from "../shared/locations.ts";
import { buildFactsFile, factsPath, writeFactsFile } from "./facts-file.ts";
import { connectToBom } from "./ftp.ts";

const ftp = connectToBom();
try {
  const file = await buildFactsFile({ ftp, now: new Date() });
  await writeFactsFile(factsPath, file);

  console.log(`Wrote ${factsPath} at ${file.generatedAt}`);
  for (const { locationId, ...sections } of file.locations) {
    console.log(`\n${locationById(locationId).name}`);
    for (const [section, facts] of Object.entries(sections)) {
      console.log(`  ${section}:`);
      for (const { from, date, status, score, text } of facts) {
        const dates = from === date ? date : `${from}..${date}`;
        console.log(
          `    ${dates.padEnd(22)} ${status.padEnd(11)} ${score.toFixed(2).padStart(5)}  ${text}`,
        );
      }
    }
  }
} finally {
  ftp.close();
}
