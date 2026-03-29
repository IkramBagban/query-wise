export function formatSchemaTypeLabel(typeLabel: string): string {
  return typeLabel
    .replace(/^character varying/i, "VARCHAR")
    .replace(/^varchar/i, "VARCHAR")
    .replace(/^character$/i, "CHAR")
    .replace(/^integer$/i, "INTEGER")
    .replace(/^bigint$/i, "BIGINT")
    .replace(/^smallint$/i, "SMALLINT")
    .replace(/^numeric/i, "NUMERIC")
    .replace(/^decimal/i, "DECIMAL")
    .replace(/^boolean$/i, "BOOLEAN")
    .replace(/^text$/i, "TEXT")
    .replace(/^uuid$/i, "UUID")
    .replace(/^date$/i, "DATE")
    .replace(/^time without time zone$/i, "TIME")
    .replace(/^time with time zone$/i, "TIMETZ")
    .replace(/^timestamp without time zone/i, "TIMESTAMP")
    .replace(/^timestamp with time zone/i, "TIMESTAMPTZ")
    .replace(/^double precision$/i, "DOUBLE PRECISION")
    .replace(/^real$/i, "REAL");
}
