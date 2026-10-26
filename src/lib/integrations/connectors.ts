import "server-only";
import { z } from "zod";
import { connect } from "node:net";
import type { ImportRow } from "./types";
import {
  boundedJson,
  IntegrationError,
  publicDatabaseAddress,
  safeIdentifier,
} from "./security";
import { IMPORT_LIMITS } from "./imports";

export const databaseConfigSchema = z
  .object({
    host: z.string().min(1).max(253),
    port: z.number().int().min(1).max(65535).optional(),
    database: z.string().min(1).max(100),
    user: z.string().min(1).max(100),
    password: z.string().min(1).max(500),
    schema: z.string().max(63).default("public"),
    table: z.string().min(1).max(63),
    columns: z.array(z.string().min(1).max(63)).min(2).max(40),
    keyColumn: z.string().min(1).max(63),
    ca: z.string().max(20_000).optional(),
  })
  .strict();
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type Snapshot = {
  rows: ImportRow[];
  complete: boolean;
  checkpoint: string;
};
export interface DataSourceAdapter<T> {
  readonly kind: string;
  readSnapshot(config: T): Promise<Snapshot>;
}
function stringifyRows(rows: Record<string, unknown>[]): ImportRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([name, value]) => {
        const text = value === null || value === undefined ? "" : String(value);
        if (text.length > IMPORT_LIMITS.cell)
          throw new IntegrationError(
            "cell_limit",
            "A source value exceeds 4,000 characters.",
          );
        return [name, text];
      }),
    ),
  );
}
export async function readDatabase(
  kind: "postgresql" | "mysql",
  input: unknown,
): Promise<Snapshot> {
  const config = databaseConfigSchema.parse(input);
  safeIdentifier(config.schema);
  safeIdentifier(config.table);
  safeIdentifier(config.keyColumn);
  config.columns.forEach(safeIdentifier);
  if (!config.columns.includes(config.keyColumn))
    throw new IntegrationError(
      "missing_key",
      "Select the stable key column among the imported columns.",
    );
  const address = await publicDatabaseAddress(config.host),
    rows: Record<string, unknown>[] = [];
  if (kind === "postgresql") {
    const { Client } = await import("pg");
    const client = new Client({
      host: address,
      port: config.port || 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: {
        rejectUnauthorized: true,
        servername: config.host,
        ...(config.ca ? { ca: config.ca } : {}),
      },
      connectionTimeoutMillis: 6000,
      statement_timeout: 6000,
      query_timeout: 8000,
      application_name: "relaydesk-readonly-source",
    });
    try {
      await client.connect();
      await client.query(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const role = await client.query(
        "SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user",
      );
      if (
        role.rows[0]?.rolsuper ||
        role.rows[0]?.rolcreaterole ||
        role.rows[0]?.rolcreatedb
      )
        throw new IntegrationError(
          "overprivileged_source",
          "Create a dedicated SELECT-only database user; administrative database users are rejected.",
        );
      const quote = (value: string) => `"${safeIdentifier(value)}"`;
      for (let offset = 0; offset <= 2000; offset += 250) {
        const result = await client.query(
          `SELECT ${config.columns.map(quote).join(",")} FROM ${quote(config.schema)}.${quote(config.table)} ORDER BY ${quote(config.keyColumn)} LIMIT $1 OFFSET $2`,
          [250, offset],
        );
        rows.push(...result.rows);
        if (result.rows.length < 250) break;
      }
      await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  } else {
    const { createConnection } = await import("mysql2/promise");
    const connection = await createConnection({
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.user,
      password: config.password,
      stream: () => connect({ host: address, port: config.port || 3306 }),
      ssl: {
        rejectUnauthorized: true,
        ...(config.ca ? { ca: config.ca } : {}),
      },
      connectTimeout: 6000,
      multipleStatements: false,
      enableKeepAlive: false,
    });
    const quote = (value: string) => "`" + safeIdentifier(value) + "`";
    try {
      await connection.query("SET SESSION MAX_EXECUTION_TIME = 6000");
      await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await connection.query(
        "START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY",
      );
      for (let offset = 0; offset <= 2000; offset += 250) {
        const [result] = await connection.execute(
          `SELECT ${config.columns.map(quote).join(",")} FROM ${quote(config.table)} ORDER BY ${quote(config.keyColumn)} LIMIT ? OFFSET ?`,
          [250, offset],
        );
        const page = result as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < 250) break;
      }
      await connection.rollback();
    } finally {
      await connection.end();
    }
  }
  if (rows.length > IMPORT_LIMITS.rows)
    throw new IntegrationError(
      "snapshot_limit",
      "This source exceeds 2,000 rows. Select a smaller read-only view. Nothing was removed or published.",
    );
  const normalized = stringifyRows(rows),
    keys = normalized.map((row) => row[config.keyColumn]);
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length)
    throw new IntegrationError(
      "source_key",
      "The selected key must be nonempty and unique.",
    );
  return {
    rows: normalized,
    complete: true,
    checkpoint: new Date().toISOString(),
  };
}
export type GoogleCredential = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
};
export async function refreshGoogle(
  credential: GoogleCredential,
): Promise<GoogleCredential> {
  if (credential.expires_at > Date.now() + 60_000) return credential;
  if (!credential.refresh_token)
    throw new IntegrationError(
      "reconnect_required",
      "Google authorization expired. Reconnect Google Sheets.",
      409,
    );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credential.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  const value = await boundedJson(response);
  if (!response.ok || !value.access_token)
    throw new IntegrationError(
      "reconnect_required",
      "Google authorization could not be refreshed. Reconnect Google Sheets.",
      409,
    );
  return {
    ...credential,
    access_token: value.access_token,
    expires_at: Date.now() + Number(value.expires_in || 3600) * 1000,
  };
}
export async function readGoogleSheet(
  credential: GoogleCredential,
  spreadsheetId: string,
  sheetName: string,
): Promise<Snapshot> {
  if (
    !/^[A-Za-z0-9_-]{15,150}$/.test(spreadsheetId) ||
    !sheetName ||
    sheetName.length > 80 ||
    /[\[\]*?:/\\]/.test(sheetName)
  )
    throw new IntegrationError(
      "sheet_invalid",
      "Enter a Google spreadsheet ID and a valid worksheet name.",
    );
  const range = `'${sheetName.replace(/'/g, "''")}'!A1:AN2002`;
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`,
    {
      headers: { authorization: `Bearer ${credential.access_token}` },
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw new IntegrationError(
      response.status === 429 ? "source_rate_limit" : "source_access",
      `Google Sheets returned HTTP ${response.status}. Check the selected file and read access.`,
      response.status === 429 ? 429 : 502,
    );
  const value = await boundedJson(response, 2_000_000),
    grid = value.values as unknown[][];
  if (!Array.isArray(grid) || grid.length < 2)
    throw new IntegrationError(
      "empty_source",
      "This worksheet has no header and data rows.",
    );
  if (grid.length > 2001)
    throw new IntegrationError(
      "snapshot_limit",
      "The worksheet exceeds 2,000 rows. Nothing was published or removed.",
    );
  const headers = grid[0].map(String);
  if (
    headers.some((header) => !header.trim()) ||
    new Set(headers).size !== headers.length
  )
    throw new IntegrationError(
      "source_headers",
      "Worksheet columns need unique nonempty headers.",
    );
  return {
    rows: stringifyRows(
      grid
        .slice(1)
        .map((row) =>
          Object.fromEntries(
            headers.map((header, index) => [header, row[index] ?? ""]),
          ),
        ),
    ),
    complete: false,
    checkpoint: new Date().toISOString(),
  }; // Bounded A:AN is deliberately NOT evidence that missing remote records were deleted.
}
