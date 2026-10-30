import { locations } from "../shared/locations.ts";
import { dailyFilePath, parseDailyFile } from "./daily-files.ts";
import { sydneyDate } from "./dates.ts";
import { connectToBom } from "./ftp.ts";

const id = process.argv[2] ?? "sydney-observatory-hill";
const location = locations.find((l) => l.id === id);
if (location === undefined) {
  throw new Error(
    `No location ${id}. Choose from ${locations.map((l) => l.id).join(", ")}`,
  );
}

const file = {
  folder: location.dailyFolder,
  month: sydneyDate(new Date()).slice(0, 7),
};
const ftp = connectToBom();
try {
  const bytes = await ftp.download(dailyFilePath(file));
  if (bytes === undefined) {
    console.log(`${dailyFilePath(file)} isn't published yet`);
  } else {
    console.log(`${location.name}, ${file.month}`);
    console.table(parseDailyFile(bytes, file));
  }
} finally {
  ftp.close();
}
