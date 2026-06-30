export function assemblePostgresUrl(fields: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}): string {
  const sslParam = fields.ssl ? "sslmode=require" : "sslmode=disable";
  const encodedPass = encodeURIComponent(fields.password);
  const encodedUser = encodeURIComponent(fields.username);
  return `postgresql://${encodedUser}:${encodedPass}@${fields.host}:${fields.port}/${fields.database}?${sslParam}`;
}
