export type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  full_data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  udt_schema: string;
  udt_name: string;
  is_pk: boolean;
  is_fk: boolean;
  foreign_table_name: string | null;
  foreign_column_name: string | null;
};

export type TableRow = {
  table_name: string;
};

export type EnumRow = {
  enum_schema: string;
  enum_name: string;
  enum_label: string;
};

export type TopValueRow = {
  column_name: string;
  value: string;
  count: string;
};
