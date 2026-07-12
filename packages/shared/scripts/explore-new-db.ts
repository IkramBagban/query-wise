import { PrismaClient } from "@prisma/client";

async function main() {
  const url = "postgresql://neondb_owner:npg_gKe1Zjr7XLOs@ep-dawn-star-ati74jxm-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url
      }
    }
  });

  const tables = [
    { schema: "sales", name: "salesorderheader" },
    { schema: "sales", name: "salesorderdetail" },
    { schema: "production", name: "product" },
    { schema: "production", name: "productcategory" }
  ];

  for (const t of tables) {
    const columns: any[] = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = $2 
      ORDER BY ordinal_position;
    `, t.schema, t.name);

    console.log(`\nColumns for table: ${t.schema}.${t.name}`);
    columns.forEach(c => {
      console.log(`  - ${c.column_name} (${c.data_type})`);
    });

    try {
      const countRes: any[] = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "${t.schema}"."${t.name}";
      `);
      console.log(`  - Row count: ${countRes[0].count}`);
    } catch (e) {
      console.log(`  - Failed to get row count: ${(e as Error).message}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
