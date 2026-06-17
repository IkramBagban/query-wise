function stripCodeFences(raw: string): string {
  return raw
    .replace(/```sql\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();
}

export function cleanGeneratedSql(raw: string): string {
  const withoutFences = stripCodeFences(raw);
  const sqlStartIndex = withoutFences.search(/\b(SELECT|WITH)\b/i);
  const fromFirstSqlToken = sqlStartIndex >= 0 ? withoutFences.slice(sqlStartIndex) : withoutFences;
  const firstSemicolonIndex = fromFirstSqlToken.indexOf(";");
  const singleStatement = firstSemicolonIndex >= 0
    ? fromFirstSqlToken.slice(0, firstSemicolonIndex)
    : fromFirstSqlToken;
  return singleStatement.trim();
}
