import { NextRequest } from "next/server";
import { checkAuth, errorResponse } from "@/lib/auth";
import { todayISO } from "@/lib/day";
import { buildExportCSV, buildExportJSON } from "@/lib/export";

// Her data, on her terms. ?format=json (complete + re-importable) or
// ?format=csv (one row per set, opens in any spreadsheet).
//
// Returned as a real file download rather than a JSON body — the point is that
// she ends up holding a copy that outlives this app.
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
    const stamp = todayISO();

    if (format === "csv") {
      const csv = await buildExportCSV();
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="volt-workouts-${stamp}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const bundle = await buildExportJSON();
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="volt-backup-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
