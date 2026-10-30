import { join } from "node:path";
import { locations } from "../shared/locations.ts";
import { sydneyDate } from "./dates.ts";
import { connectToBom } from "./ftp.ts";
import { updateFtpHistory } from "./ftp-history.ts";

const dir = join(import.meta.dirname, "../../data/ftp-history");
const today = sydneyDate(new Date());
const ftp = connectToBom();
try {
  for (const location of locations) {
    const history = await updateFtpHistory({
      ftp,
      dir,
      location,
      today,
      onSaved: (station, month) => {
        console.log(`${station.station} ${month}`);
      },
    });
    console.log(
      `${location.name}: ${String(history.length)} days, ${history[0]?.date ?? "none"} to ${history.at(-1)?.date ?? "none"}`,
    );
  }
} finally {
  ftp.close();
}
