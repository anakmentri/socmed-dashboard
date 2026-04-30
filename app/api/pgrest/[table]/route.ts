import { NextRequest, NextResponse } from "next/server";
import { getPool, SCHEMA } from "@/lib/pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Whitelist tabel yang boleh diakses via proxy (security)
const ALLOWED_TABLES = new Set([
  "team_members",
  "attendance",
  "daily_work",
  "ir_data",
  "report_items",
  "soc_accounts",
  "banned_accounts",
  "platforms",
  "assets",
  "twitter_connections",
  "twitter_oauth_states",
  "twitter_posts",
  "telegram_connections",
  "social_posts",
  "activity_log",
  "content_library",
  "post_schedules",
  "scheduled_runs",
  "scheduled_posts",
]);

// PostgREST operator → SQL clause builder
type ParamValue = string | number | boolean | null | string[];
function buildWhereClause(
  searchParams: URLSearchParams,
  startIdx = 1
): { sql: string; values: ParamValue[]; nextIdx: number } {
  const conditions: string[] = [];
  const values: ParamValue[] = [];
  let idx = startIdx;

  for (const [key, value] of searchParams.entries()) {
    // Skip query params yang bukan filter
    if (
      ["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)
    ) {
      continue;
    }

    // Format: col=op.value (e.g., id=eq.5, name=like.*foo*, date=gte.2024-01-01)
    const m = value.match(/^(eq|neq|gt|gte|lt|lte|like|ilike|in|is|not\.is)\.(.*)$/s);
    if (!m) {
      // Treat as eq if no operator
      conditions.push(`"${key}" = $${idx++}`);
      values.push(value);
      continue;
    }
    const [, op, raw] = m;
    const safeKey = `"${key.replace(/"/g, "")}"`;

    switch (op) {
      case "eq":
        conditions.push(`${safeKey} = $${idx++}`);
        values.push(parseValue(raw));
        break;
      case "neq":
        conditions.push(`${safeKey} <> $${idx++}`);
        values.push(parseValue(raw));
        break;
      case "gt":
        conditions.push(`${safeKey} > $${idx++}`);
        values.push(parseValue(raw));
        break;
      case "gte":
        conditions.push(`${safeKey} >= $${idx++}`);
        values.push(parseValue(raw));
        break;
      case "lt":
        conditions.push(`${safeKey} < $${idx++}`);
        values.push(parseValue(raw));
        break;
      case "lte":
        conditions.push(`${safeKey} <= $${idx++}`);
        values.push(parseValue(raw));
        break;
      case "like":
        conditions.push(`${safeKey} LIKE $${idx++}`);
        values.push(raw.replace(/\*/g, "%"));
        break;
      case "ilike":
        conditions.push(`${safeKey} ILIKE $${idx++}`);
        values.push(raw.replace(/\*/g, "%"));
        break;
      case "in": {
        // Format: in.(val1,val2,val3) atau in.val1,val2
        const items = raw
          .replace(/^\(/, "")
          .replace(/\)$/, "")
          .split(",")
          .map((s) => s.trim());
        if (items.length === 0) continue;
        const placeholders = items.map(() => `$${idx++}`).join(",");
        conditions.push(`${safeKey} IN (${placeholders})`);
        items.forEach((v) => values.push(parseValue(v)));
        break;
      }
      case "is":
        if (raw === "null") conditions.push(`${safeKey} IS NULL`);
        else if (raw === "true") conditions.push(`${safeKey} IS TRUE`);
        else if (raw === "false") conditions.push(`${safeKey} IS FALSE`);
        break;
      case "not.is":
        if (raw === "null") conditions.push(`${safeKey} IS NOT NULL`);
        break;
    }
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
    values,
    nextIdx: idx,
  };
}

function parseValue(s: string): ParamValue {
  if (s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  // Don't auto-convert numeric strings — keep as string for text columns
  // PG will coerce as needed
  return s;
}

function buildOrderClause(searchParams: URLSearchParams): string {
  const order = searchParams.get("order");
  if (!order) return "";
  // Format: col.asc atau col.desc, multiple = col1.asc,col2.desc
  const parts = order.split(",").map((part) => {
    const [col, direction] = part.split(".");
    const dir = direction?.toLowerCase() === "desc" ? "DESC" : "ASC";
    const safeCol = col.replace(/[^a-zA-Z0-9_]/g, "");
    return `"${safeCol}" ${dir} NULLS LAST`;
  });
  return parts.length > 0 ? `ORDER BY ${parts.join(", ")}` : "";
}

function buildSelectColumns(searchParams: URLSearchParams): string {
  const select = searchParams.get("select") || "*";
  if (select === "*") return "*";
  // Hanya support comma-separated col list, no joins/embed
  return select
    .split(",")
    .map((c) => `"${c.trim().replace(/[^a-zA-Z0-9_]/g, "")}"`)
    .join(", ");
}

function getRangeFromHeader(req: NextRequest): { from: number; to: number } | null {
  const range = req.headers.get("range");
  if (!range) return null;
  const m = range.match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  return { from: Number(m[1]), to: Number(m[2]) };
}

function shouldReturnRepresentation(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("return=representation");
}

function shouldReturnExactCount(req: NextRequest): boolean {
  const prefer = req.headers.get("prefer") || "";
  return prefer.includes("count=exact");
}

function shouldReturnSingle(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  return accept.includes("application/vnd.pgrst.object+json");
}

function checkAuth(req: NextRequest): boolean {
  // Sederhana: cek apikey header match anon key
  // Mencegah random user dari internet hit /api/pgrest/team_members
  const apikey = req.headers.get("apikey") || "";
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!expected) return true; // env not set, allow (dev fallback)
  if (apikey === expected) return true;
  if (auth === `Bearer ${expected}`) return true;
  return false;
}

async function validateTable(table: string): Promise<NextResponse | null> {
  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json(
      { error: `Table '${table}' not allowed` },
      { status: 404 }
    );
  }
  return null;
}

// ============ GET (SELECT) ============
export async function GET(
  req: NextRequest,
  { params }: { params: { table: string } }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tableErr = await validateTable(params.table);
  if (tableErr) return tableErr;

  try {
    const { searchParams } = new URL(req.url);
    const cols = buildSelectColumns(searchParams);
    const where = buildWhereClause(searchParams);
    const order = buildOrderClause(searchParams);

    // Pagination via Range header (preferred by Supabase JS) or limit/offset query
    const rangeHeader = getRangeFromHeader(req);
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");

    let limitClause = "";
    let from = 0;
    let to = -1;
    if (rangeHeader) {
      from = rangeHeader.from;
      to = rangeHeader.to;
      limitClause = `LIMIT ${to - from + 1} OFFSET ${from}`;
    } else if (limit) {
      const lim = parseInt(limit, 10);
      const off = parseInt(offset || "0", 10);
      from = off;
      to = off + lim - 1;
      limitClause = `LIMIT ${lim} OFFSET ${off}`;
    } else {
      limitClause = "LIMIT 1000"; // default safety limit
    }

    const sql = `SELECT ${cols} FROM ${SCHEMA}."${params.table}" ${where.sql} ${order} ${limitClause}`.trim();
    const pool = getPool();
    const r = await pool.query(sql, where.values);

    // Headers untuk match PostgREST
    const headers: Record<string, string> = {};
    let totalCount: number | null = null;

    if (shouldReturnExactCount(req)) {
      const countSql = `SELECT COUNT(*)::int AS c FROM ${SCHEMA}."${params.table}" ${where.sql}`;
      const cr = await pool.query(countSql, where.values);
      totalCount = (cr.rows[0]?.c ?? 0) as number;
      const rangeFrom = from;
      const rangeTo = Math.min(from + r.rows.length - 1, Math.max(0, totalCount - 1));
      headers["Content-Range"] = `${rangeFrom}-${rangeTo}/${totalCount}`;
    } else {
      const rangeTo = from + r.rows.length - 1;
      headers["Content-Range"] = `${from}-${rangeTo}/*`;
    }

    if (shouldReturnSingle(req)) {
      if (r.rows.length === 0) {
        return NextResponse.json(
          {
            code: "PGRST116",
            details: "Results contain 0 rows",
            hint: null,
            message: "JSON object requested, multiple (or no) rows returned",
          },
          { status: 406, headers }
        );
      }
      return NextResponse.json(r.rows[0], { headers });
    }

    return NextResponse.json(r.rows, { headers });
  } catch (e) {
    console.error("PG proxy GET error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error", code: "PG_ERROR" },
      { status: 500 }
    );
  }
}

// ============ POST (INSERT) ============
export async function POST(
  req: NextRequest,
  { params }: { params: { table: string } }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tableErr = await validateTable(params.table);
  if (tableErr) return tableErr;

  try {
    const body = await req.json();
    const rows: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
    if (rows.length === 0) return NextResponse.json([], { status: 200 });

    const cols = Object.keys(rows[0]);
    if (cols.length === 0)
      return NextResponse.json({ error: "Empty row" }, { status: 400 });

    // ON CONFLICT support (upsert via Prefer: resolution=merge-duplicates atau on_conflict param)
    const url = new URL(req.url);
    const onConflictCol = url.searchParams.get("on_conflict");
    const prefer = req.headers.get("prefer") || "";
    const isUpsert = prefer.includes("resolution=merge-duplicates") || !!onConflictCol;

    const placeholders: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const row of rows) {
      const ph = cols
        .map((c) => {
          let v = row[c];
          if (v !== null && typeof v === "object" && !(v instanceof Date)) {
            v = JSON.stringify(v);
          }
          values.push(v);
          return `$${idx++}`;
        })
        .join(",");
      placeholders.push(`(${ph})`);
    }

    const colList = cols.map((c) => `"${c}"`).join(",");
    let sql = `INSERT INTO ${SCHEMA}."${params.table}" (${colList}) VALUES ${placeholders.join(",")}`;

    if (isUpsert) {
      const conflictCol = onConflictCol || "id";
      const updateClause = cols
        .filter((c) => c !== conflictCol)
        .map((c) => `"${c}" = EXCLUDED."${c}"`)
        .join(", ");
      if (updateClause) {
        sql += ` ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateClause}`;
      } else {
        sql += ` ON CONFLICT ("${conflictCol}") DO NOTHING`;
      }
    }

    if (shouldReturnRepresentation(req)) {
      sql += " RETURNING *";
    }

    const pool = getPool();
    const r = await pool.query(sql, values);

    if (shouldReturnRepresentation(req)) {
      if (shouldReturnSingle(req)) {
        return NextResponse.json(r.rows[0] || null, { status: 201 });
      }
      return NextResponse.json(r.rows, { status: 201 });
    }
    return new NextResponse(null, { status: 201 });
  } catch (e) {
    console.error("PG proxy POST error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error", code: "PG_ERROR" },
      { status: 500 }
    );
  }
}

// ============ PATCH (UPDATE) ============
export async function PATCH(
  req: NextRequest,
  { params }: { params: { table: string } }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tableErr = await validateTable(params.table);
  if (tableErr) return tableErr;

  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body required" }, { status: 400 });
    }
    const cols = Object.keys(body);
    if (cols.length === 0)
      return NextResponse.json({ error: "Empty body" }, { status: 400 });

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const c of cols) {
      let v = (body as Record<string, unknown>)[c];
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        v = JSON.stringify(v);
      }
      setClauses.push(`"${c}" = $${idx++}`);
      values.push(v);
    }

    const { searchParams } = new URL(req.url);
    const where = buildWhereClause(searchParams, idx);

    if (!where.sql) {
      return NextResponse.json(
        { error: "UPDATE without WHERE not allowed" },
        { status: 400 }
      );
    }

    let sql = `UPDATE ${SCHEMA}."${params.table}" SET ${setClauses.join(", ")} ${where.sql}`;
    if (shouldReturnRepresentation(req)) sql += " RETURNING *";

    const pool = getPool();
    const r = await pool.query(sql, [...values, ...where.values]);

    if (shouldReturnRepresentation(req)) {
      if (shouldReturnSingle(req)) {
        return NextResponse.json(r.rows[0] || null);
      }
      return NextResponse.json(r.rows);
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("PG proxy PATCH error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error", code: "PG_ERROR" },
      { status: 500 }
    );
  }
}

// ============ DELETE ============
export async function DELETE(
  req: NextRequest,
  { params }: { params: { table: string } }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tableErr = await validateTable(params.table);
  if (tableErr) return tableErr;

  try {
    const { searchParams } = new URL(req.url);
    const where = buildWhereClause(searchParams);
    if (!where.sql) {
      return NextResponse.json(
        { error: "DELETE without WHERE not allowed" },
        { status: 400 }
      );
    }
    let sql = `DELETE FROM ${SCHEMA}."${params.table}" ${where.sql}`;
    if (shouldReturnRepresentation(req)) sql += " RETURNING *";

    const pool = getPool();
    const r = await pool.query(sql, where.values);

    if (shouldReturnRepresentation(req)) {
      return NextResponse.json(r.rows);
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("PG proxy DELETE error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error", code: "PG_ERROR" },
      { status: 500 }
    );
  }
}
