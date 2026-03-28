import { faker } from "@faker-js/faker";
import type { PoolClient } from "pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DEMO_DATABASE_URL = process.env.DEMO_DATABASE_URL;

if (!DEMO_DATABASE_URL) {
  throw new Error("DEMO_DATABASE_URL is missing in .env.local");
}

const pool = new Pool({
  connectionString: DEMO_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type Segment = "retail" | "wholesale" | "enterprise";
type OrderStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";
type PaymentMethod = "credit_card" | "paypal" | "bank_transfer";

const CATEGORIES = [
  { name: "Electronics", slug: "electronics", description: "Devices and gadgets" },
  { name: "Clothing", slug: "clothing", description: "Apparel and accessories" },
  { name: "Home & Garden", slug: "home-garden", description: "Home improvement and decor" },
  { name: "Sports & Outdoors", slug: "sports-outdoors", description: "Fitness and outdoor gear" },
  { name: "Books", slug: "books", description: "Print and digital reading products" },
  { name: "Beauty & Health", slug: "beauty-health", description: "Skincare and wellness products" },
  { name: "Toys & Games", slug: "toys-games", description: "Kids and family entertainment" },
  { name: "Food & Beverage", slug: "food-beverage", description: "Packaged food and drinks" },
] as const;

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

const HEAVY_STATES = ["CA", "TX", "NY", "FL", "WA"];
const PRODUCT_RANGES: Record<
  (typeof CATEGORIES)[number]["name"],
  { min: number; max: number; adjectives: string[]; nouns: string[] }
> = {
  Electronics: {
    min: 29,
    max: 1499,
    adjectives: ["Smart", "Wireless", "Ultra", "Pro", "Nano", "Digital"],
    nouns: ["Speaker", "Headphones", "Tablet", "Monitor", "Camera", "Hub"],
  },
  Clothing: {
    min: 15,
    max: 250,
    adjectives: ["Classic", "Modern", "Relaxed", "Slim", "Essential", "All-Season"],
    nouns: ["Jacket", "Hoodie", "Jeans", "Shirt", "Dress", "Sneakers"],
  },
  "Home & Garden": {
    min: 12,
    max: 599,
    adjectives: ["Eco", "Premium", "Urban", "Compact", "Handcrafted", "Signature"],
    nouns: ["Lamp", "Shelf", "Planter", "Bedding Set", "Cookware Set", "Vacuum"],
  },
  "Sports & Outdoors": {
    min: 20,
    max: 499,
    adjectives: ["Active", "Trail", "Pro", "Performance", "Hydro", "Summit"],
    nouns: ["Backpack", "Yoga Mat", "Dumbbell Set", "Tent", "Cycling Helmet", "Running Watch"],
  },
  Books: {
    min: 8,
    max: 60,
    adjectives: ["Complete", "Practical", "Definitive", "Modern", "Advanced", "Pocket"],
    nouns: ["Guide", "Handbook", "Workbook", "Atlas", "Companion", "Manual"],
  },
  "Beauty & Health": {
    min: 10,
    max: 120,
    adjectives: ["Hydrating", "Daily", "Nourishing", "Clean", "Repair", "Glow"],
    nouns: ["Serum", "Moisturizer", "Cleanser", "Supplement", "Sunscreen", "Mask"],
  },
  "Toys & Games": {
    min: 8,
    max: 200,
    adjectives: ["Interactive", "Creative", "Deluxe", "Mini", "Family", "STEM"],
    nouns: ["Puzzle", "Board Game", "Building Set", "RC Car", "Dollhouse", "Play Kit"],
  },
  "Food & Beverage": {
    min: 5,
    max: 80,
    adjectives: ["Organic", "Artisan", "Roasted", "Seasonal", "Premium", "Classic"],
    nouns: ["Coffee Beans", "Tea Box", "Snack Pack", "Sauce Set", "Protein Mix", "Gift Basket"],
  },
};

interface CustomerSeed {
  email: string;
  firstName: string;
  lastName: string;
  city: string;
  state: string;
  country: string;
  segment: Segment;
  createdAt: Date;
}

interface ProductSeed {
  categoryId: number;
  name: string;
  description: string;
  price: number;
  cost: number;
  sku: string;
  stockQuantity: number;
  isActive: boolean;
}

interface OrderDraft {
  customerId: number;
  status: OrderStatus;
  totalAmount: number;
  shippingAmount: number;
  discountAmount: number;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}

interface OrderItemDraft {
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

const BATCH_SIZE = 100;
const CUSTOMER_COUNT = 500;
const PRODUCT_COUNT = 120;
const ORDER_COUNT = 10000;

function logStep(msg: string): void {
  // concise logs for long-running seed operations
  console.log(`[seed] ${msg}`);
}

function toMoney(value: number): number {
  return Number(value.toFixed(2));
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) {
      return items[i];
    }
  }
  return items[items.length - 1];
}

function randomDateWithinLastMonths(monthsBack: number): Date {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  return faker.date.between({ from: start, to: now });
}

function pickState(): string {
  if (Math.random() < 0.6) {
    return faker.helpers.arrayElement(HEAVY_STATES);
  }
  return faker.helpers.arrayElement(US_STATES);
}

function monthWeight(month: number): number {
  if (month === 11 || month === 12) return 2.5;
  if (month === 1) return 0.7;
  return 1;
}

function randomDateInWeightedMonth(): Date {
  const now = new Date();
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const selected = weightedPick(
    months,
    months.map((m) => monthWeight(m.month))
  );

  const start = new Date(selected.year, selected.month - 1, 1, 0, 0, 0, 0);
  const end = new Date(selected.year, selected.month, 0, 23, 59, 59, 999);
  const boundedEnd = end > now ? now : end;
  return faker.date.between({ from: start, to: boundedEnd });
}

async function batchInsert(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: Array<Array<string | number | boolean | Date | null>>,
  returning: string[] = []
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return [];

  const values: Array<string | number | boolean | Date | null> = [];
  const placeholders = rows
    .map((row, rowIndex) => {
      const cells = row.map((_, colIndex) => {
        const paramIndex = rowIndex * columns.length + colIndex + 1;
        return `$${paramIndex}`;
      });
      values.push(...row);
      return `(${cells.join(", ")})`;
    })
    .join(", ");

  const returningClause =
    returning.length > 0 ? ` RETURNING ${returning.map((c) => `"${c}"`).join(", ")}` : "";

  const sql = `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(", ")}) VALUES ${placeholders}${returningClause}`;
  const result = await client.query(sql, values);
  return result.rows;
}

async function dropTables(client: PoolClient): Promise<void> {
  logStep("Dropping existing tables (if any)");
  await client.query(`
    DROP TABLE IF EXISTS reviews CASCADE;
    DROP TABLE IF EXISTS order_items CASCADE;
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS products CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;
    DROP TABLE IF EXISTS categories CASCADE;
  `);
}

async function createTables(client: PoolClient): Promise<void> {
  logStep("Creating tables");
  await client.query(`
    CREATE TABLE categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      description TEXT
    );

    CREATE TABLE customers (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      city VARCHAR(100),
      state VARCHAR(50),
      country VARCHAR(50) DEFAULT 'US',
      segment VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE products (
      id SERIAL PRIMARY KEY,
      category_id INTEGER REFERENCES categories(id),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      cost DECIMAL(10,2) NOT NULL,
      sku VARCHAR(100) UNIQUE,
      stock_quantity INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true
    );

    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id),
      status VARCHAR(50) NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      shipping_amount DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      payment_method VARCHAR(50),
      created_at TIMESTAMP NOT NULL,
      shipped_at TIMESTAMP,
      delivered_at TIMESTAMP
    );

    CREATE TABLE order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES orders(id),
      product_id INTEGER REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      total_price DECIMAL(10,2) NOT NULL
    );

    CREATE TABLE reviews (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id),
      product_id INTEGER REFERENCES products(id),
      order_id INTEGER REFERENCES orders(id),
      rating INTEGER CHECK (rating BETWEEN 1 AND 5),
      title VARCHAR(255),
      body TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

async function seedCategories(client: PoolClient): Promise<number[]> {
  logStep("Seeding categories");
  const rows = CATEGORIES.map((c) => [c.name, c.slug, c.description]);
  const inserted = await batchInsert(client, "categories", ["name", "slug", "description"], rows, [
    "id",
  ]);
  return inserted.map((row) => Number(row.id));
}

async function seedCustomers(client: PoolClient): Promise<number[]> {
  logStep("Seeding customers");
  const customers: CustomerSeed[] = [];

  for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
    const segment = weightedPick<Segment>(
      ["retail", "wholesale", "enterprise"],
      [0.6, 0.3, 0.1]
    );
    customers.push({
      email: faker.internet.email().toLowerCase(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      city: faker.location.city(),
      state: pickState(),
      country: "US",
      segment,
      createdAt: randomDateWithinLastMonths(18),
    });
  }

  const ids: number[] = [];
  for (let i = 0; i < customers.length; i += BATCH_SIZE) {
    const chunk = customers.slice(i, i + BATCH_SIZE);
    const rows = chunk.map((c) => [
      c.email,
      c.firstName,
      c.lastName,
      c.city,
      c.state,
      c.country,
      c.segment,
      c.createdAt,
    ]);
    const inserted = await batchInsert(
      client,
      "customers",
      ["email", "first_name", "last_name", "city", "state", "country", "segment", "created_at"],
      rows,
      ["id"]
    );
    ids.push(...inserted.map((row) => Number(row.id)));
  }
  return ids;
}

function productNameForCategory(categoryName: (typeof CATEGORIES)[number]["name"]): string {
  const profile = PRODUCT_RANGES[categoryName];
  const adjective = faker.helpers.arrayElement(profile.adjectives);
  const noun = faker.helpers.arrayElement(profile.nouns);
  return `${adjective} ${noun}`;
}

async function seedProducts(client: PoolClient, categoryIds: number[]): Promise<Array<{ id: number; price: number }>> {
  logStep("Seeding products");
  const products: ProductSeed[] = [];

  for (let i = 0; i < PRODUCT_COUNT; i += 1) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const categoryId = categoryIds[i % categoryIds.length];
    const profile = PRODUCT_RANGES[category.name];
    const price = toMoney(faker.number.float({ min: profile.min, max: profile.max, fractionDigits: 2 }));
    const cost = toMoney(price * faker.number.float({ min: 0.35, max: 0.65, fractionDigits: 4 }));

    products.push({
      categoryId,
      name: productNameForCategory(category.name),
      description: faker.commerce.productDescription(),
      price,
      cost,
      sku: `${category.slug.toUpperCase()}-${faker.string.alphanumeric(8).toUpperCase()}`,
      stockQuantity: faker.number.int({ min: 5, max: 500 }),
      isActive: Math.random() > 0.08,
    });
  }

  const insertedProducts: Array<{ id: number; price: number }> = [];
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE);
    const rows = chunk.map((p) => [
      p.categoryId,
      p.name,
      p.description,
      p.price,
      p.cost,
      p.sku,
      p.stockQuantity,
      p.isActive,
    ]);
    const inserted = await batchInsert(
      client,
      "products",
      ["category_id", "name", "description", "price", "cost", "sku", "stock_quantity", "is_active"],
      rows,
      ["id", "price"]
    );
    insertedProducts.push(
      ...inserted.map((row) => ({ id: Number(row.id), price: Number(row.price) }))
    );
  }

  return insertedProducts;
}

function computeShipmentDates(status: OrderStatus, createdAt: Date): { shippedAt: Date | null; deliveredAt: Date | null } {
  if (status === "pending" || status === "processing" || status === "cancelled") {
    return { shippedAt: null, deliveredAt: null };
  }

  const shippedAt = faker.date.soon({ days: 4, refDate: createdAt });
  if (status === "shipped") {
    return { shippedAt, deliveredAt: null };
  }

  const deliveredAt = faker.date.soon({ days: 8, refDate: shippedAt });
  return { shippedAt, deliveredAt };
}

async function seedOrdersAndItems(
  client: PoolClient,
  customerIds: number[],
  products: Array<{ id: number; price: number }>
): Promise<Map<number, { customerId: number; productId: number; createdAt: Date }>> {
  logStep("Seeding orders and order_items");

  const orderMeta = new Map<number, { customerId: number; productId: number; createdAt: Date }>();

  for (let start = 0; start < ORDER_COUNT; start += BATCH_SIZE) {
    const currentBatchSize = Math.min(BATCH_SIZE, ORDER_COUNT - start);
    const orderDrafts: OrderDraft[] = [];
    const itemsByDraftIndex: Omit<OrderItemDraft, "orderId">[][] = [];

    for (let i = 0; i < currentBatchSize; i += 1) {
      const customerId = faker.helpers.arrayElement(customerIds);
      const createdAt = randomDateInWeightedMonth();
      const status = weightedPick<OrderStatus>(
        ["delivered", "shipped", "processing", "pending", "cancelled", "refunded"],
        [0.65, 0.15, 0.1, 0.05, 0.03, 0.02]
      );
      const paymentMethod = weightedPick<PaymentMethod>(
        ["credit_card", "paypal", "bank_transfer"],
        [0.55, 0.3, 0.15]
      );
      const itemCount = weightedPick<number>([1, 2, 3, 4, 5], [0.15, 0.3, 0.3, 0.15, 0.1]);

      const items: Omit<OrderItemDraft, "orderId">[] = [];
      let subtotal = 0;
      for (let j = 0; j < itemCount; j += 1) {
        const product = faker.helpers.arrayElement(products);
        const quantity = faker.number.int({ min: 1, max: 4 });
        const unitPrice = toMoney(product.price);
        const totalPrice = toMoney(unitPrice * quantity);
        subtotal += totalPrice;
        items.push({ productId: product.id, quantity, unitPrice, totalPrice });
      }

      subtotal = toMoney(subtotal);
      const hasDiscount = Math.random() < 0.2;
      const discountAmount = hasDiscount
        ? toMoney(subtotal * faker.number.float({ min: 0.05, max: 0.25, fractionDigits: 3 }))
        : 0;
      const net = Math.max(0, toMoney(subtotal - discountAmount));
      const shippingAmount = net > 75 ? 0 : toMoney(faker.number.float({ min: 5.99, max: 12.99, fractionDigits: 2 }));
      const totalAmount = toMoney(net + shippingAmount);
      const { shippedAt, deliveredAt } = computeShipmentDates(status, createdAt);

      orderDrafts.push({
        customerId,
        status,
        totalAmount,
        shippingAmount,
        discountAmount,
        paymentMethod,
        createdAt,
        shippedAt,
        deliveredAt,
      });
      itemsByDraftIndex.push(items);
    }

    const orderRows = orderDrafts.map((o) => [
      o.customerId,
      o.status,
      o.totalAmount,
      o.shippingAmount,
      o.discountAmount,
      o.paymentMethod,
      o.createdAt,
      o.shippedAt,
      o.deliveredAt,
    ]);

    const insertedOrders = await batchInsert(
      client,
      "orders",
      [
        "customer_id",
        "status",
        "total_amount",
        "shipping_amount",
        "discount_amount",
        "payment_method",
        "created_at",
        "shipped_at",
        "delivered_at",
      ],
      orderRows,
      ["id"]
    );

    const itemRows: Array<Array<number>> = [];
    for (let idx = 0; idx < insertedOrders.length; idx += 1) {
      const orderId = Number(insertedOrders[idx].id);
      const draft = orderDrafts[idx];
      const items = itemsByDraftIndex[idx];
      const primaryProduct = items[0]?.productId ?? products[0].id;
      orderMeta.set(orderId, {
        customerId: draft.customerId,
        productId: primaryProduct,
        createdAt: draft.createdAt,
      });

      for (const item of items) {
        itemRows.push([orderId, item.productId, item.quantity, item.unitPrice, item.totalPrice]);
      }
    }

    for (let i = 0; i < itemRows.length; i += BATCH_SIZE) {
      const chunk = itemRows.slice(i, i + BATCH_SIZE);
      await batchInsert(
        client,
        "order_items",
        ["order_id", "product_id", "quantity", "unit_price", "total_price"],
        chunk
      );
    }

    if ((start + currentBatchSize) % 1000 === 0) {
      logStep(`Inserted ${start + currentBatchSize}/${ORDER_COUNT} orders`);
    }
  }

  return orderMeta;
}

function weightedRating(): number {
  return weightedPick<number>([5, 4, 3, 2, 1], [0.45, 0.3, 0.15, 0.07, 0.03]);
}

async function seedReviews(
  client: PoolClient,
  orderMeta: Map<number, { customerId: number; productId: number; createdAt: Date }>
): Promise<void> {
  logStep("Seeding reviews");

  const deliveredOrdersResult = await client.query<{ id: number }>(
    "SELECT id FROM orders WHERE status = 'delivered'"
  );
  const deliveredIds = deliveredOrdersResult.rows.map((r) => Number(r.id));
  const selectedForReview = deliveredIds.filter(() => Math.random() < 0.4);

  const reviewRows: Array<Array<string | number | Date>> = [];
  for (const orderId of selectedForReview) {
    const meta = orderMeta.get(orderId);
    if (!meta) continue;
    const rating = weightedRating();
    const createdAt = faker.date.soon({ days: 30, refDate: meta.createdAt });
    reviewRows.push([
      meta.customerId,
      meta.productId,
      orderId,
      rating,
      faker.lorem.sentence({ min: 3, max: 8 }),
      faker.lorem.sentences({ min: 1, max: 3 }),
      createdAt,
    ]);
  }

  for (let i = 0; i < reviewRows.length; i += BATCH_SIZE) {
    const chunk = reviewRows.slice(i, i + BATCH_SIZE);
    await batchInsert(
      client,
      "reviews",
      ["customer_id", "product_id", "order_id", "rating", "title", "body", "created_at"],
      chunk
    );
  }

  logStep(`Inserted ${reviewRows.length} reviews`);
}

async function verifyCounts(client: PoolClient): Promise<void> {
  const checks = [
    { table: "categories", min: 8 },
    { table: "customers", min: 500 },
    { table: "products", min: 120 },
    { table: "orders", min: 10000 },
    { table: "order_items", min: 25000 },
    { table: "reviews", min: 2500 },
  ];

  for (const check of checks) {
    const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${check.table}`);
    const count = Number(result.rows[0]?.count ?? 0);
    logStep(`${check.table}: ${count}`);
    if (count < check.min) {
      throw new Error(`Expected at least ${check.min} rows in ${check.table}, found ${count}`);
    }
  }
}

async function main(): Promise<void> {
  logStep("Starting seed");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await dropTables(client);
    await createTables(client);

    const categoryIds = await seedCategories(client);
    const customerIds = await seedCustomers(client);
    const products = await seedProducts(client, categoryIds);
    const orderMeta = await seedOrdersAndItems(client, customerIds, products);
    await seedReviews(client, orderMeta);
    await verifyCounts(client);

    await client.query("COMMIT");
    logStep("Seed complete");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[seed] Failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
