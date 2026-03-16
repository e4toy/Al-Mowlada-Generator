import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const owners = pgTable("owners", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  status: text("status").notNull().default("pending"),
  isActive: boolean("is_active").notNull().default(true),
  activatedAt: text("activated_at"),
  expiryDate: text("expiry_date"),
  invitationCode: text("invitation_code").unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const subscribers = pgTable("subscribers", {
  id: varchar("id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  amperes: integer("amperes").notNull(),
  tier: text("tier").notNull(),
  createdMonth: text("created_month").notNull(),
  updatedAt: text("updated_at"),
});

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  subscriberId: varchar("subscriber_id").notNull(),
  month: text("month").notNull(),
  amount: numeric("amount").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  updatedAt: text("updated_at"),
});

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey(),
  ownerId: varchar("owner_id").notNull(),
  month: text("month").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount").notNull(),
  date: text("date").notNull(),
  updatedAt: text("updated_at"),
});

export const pricing = pgTable("pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  month: text("month").notNull(),
  gold: numeric("gold").notNull().default("0"),
  silver: numeric("silver").notNull().default("0"),
  bronze: numeric("bronze").notNull().default("0"),
  updatedAt: text("updated_at"),
});

export const appUsers = pgTable("app_users", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  linkedOwnerId: varchar("linked_owner_id").notNull(),
  linkedSubscriberId: varchar("linked_subscriber_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  userType: text("user_type").notNull(),
  methodType: text("method_type").notNull(),
  details: text("details").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const payouts = pgTable("payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(),
  amount: numeric("amount").notNull(),
  status: text("status").notNull().default("pending"),
  transactionId: varchar("transaction_id"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertOwnerSchema = createInsertSchema(owners);
export const insertSubscriberSchema = createInsertSchema(subscribers);
export const insertPaymentSchema = createInsertSchema(payments);
export const insertExpenseSchema = createInsertSchema(expenses);
export const insertPricingSchema = createInsertSchema(pricing);
export const insertAppUserSchema = createInsertSchema(appUsers);
export const insertMessageSchema = createInsertSchema(messages);

export type Owner = typeof owners.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Pricing = typeof pricing.$inferSelect;
export type AppUser = typeof appUsers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
