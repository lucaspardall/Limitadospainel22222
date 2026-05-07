import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { serversTable } from "./servers";

export const gameModesTable = pgTable("game_modes", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull().references(() => serversTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  gameType: integer("game_type").notNull().default(0),
  gameMode: integer("game_mode").notNull().default(1),
  plugins: text("plugins").notNull().default("[]"),
  configs: text("configs").notNull().default("[]"),
  cvars: text("cvars").notNull().default("{}"),
  mapgroup: text("mapgroup").default("mg_active"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GameMode = typeof gameModesTable.$inferSelect;
