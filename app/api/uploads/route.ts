import { getDb, schema } from "@/lib/db";
import { parseFiles } from "@/lib/data/parse";
import { handle } from "@/lib/api";
import { HttpError } from "@/lib/queries";
import { currentUser } from "@/lib/user";

// Receives the files, stages the parsed raw rows and creates the upload + run. The client then calls /execute.
export async function POST(req: Request) {
  return handle(async () => {
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const runDate = String(form.get("runDate") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) throw new HttpError(400, "Run date must be YYYY-MM-DD");
    if (!files.length) throw new HttpError(400, "Upload one .xlsx or up to 5 .csv files");
    const xlsx = files.filter((f) => /\.xlsx?$/i.test(f.name));
    const csv = files.filter((f) => /\.csv$/i.test(f.name));
    if (xlsx.length + csv.length !== files.length) throw new HttpError(400, "Only .xlsx and .csv files are supported");
    if (xlsx.length > 1 || (xlsx.length && csv.length) || csv.length > 5) throw new HttpError(400, "Upload either one .xlsx or up to 5 .csv files");

    let rawRows;
    try {
      rawRows = parseFiles(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
    } catch (e) {
      throw new HttpError(400, `Could not read the file(s): ${e instanceof Error ? e.message : e}`);
    }

    const db = getDb();
    const user = await currentUser();
    const [upload] = await db
      .insert(schema.uploads)
      .values({ uploadedBy: user, fileNames: files.map((f) => f.name), rawRows, status: "parsed" })
      .returning({ id: schema.uploads.id });
    const [run] = await db.insert(schema.runs).values({ uploadId: upload.id, runDate, status: "parsing" }).returning({ id: schema.runs.id });
    return { uploadId: upload.id, runId: run.id, sheets: Object.fromEntries(Object.entries(rawRows).map(([k, v]) => [k, v.length])) };
  });
}
