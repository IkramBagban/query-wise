function stripCodeFences(raw: string): string {
  return raw
    .replace(/```sql\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();
}

export function cleanGeneratedSql(raw: string): string {
  const withoutFences = stripCodeFences(raw);
  const sqlStartIndex = withoutFences.search(/\b(SELECT|WITH)\b/i);
  return (sqlStartIndex >= 0 ? withoutFences.slice(sqlStartIndex) : withoutFences).trim();
}
