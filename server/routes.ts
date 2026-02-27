import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { getDb, schema } from "./db";
import { eq, and } from "drizzle-orm";

export async function registerRoutes(app: Express): Promise<Server> {
  const db = getDb();

  app.post("/api/owners/signup", async (req, res) => {
    try {
      const { id, name, phone, email, password, status, isActive, activatedAt, expiryDate, createdAt, updatedAt } = req.body;
      const existing = await db.select().from(schema.owners).where(eq(schema.owners.email, email.toLowerCase()));
      if (existing.length > 0) {
        return res.status(409).json({ message: "البريد الإلكتروني مسجل مسبقاً" });
      }
      await db.insert(schema.owners).values({
        id, name, phone, email: email.toLowerCase(), password,
        status: status || "pending",
        isActive: isActive !== undefined ? isActive : true,
        activatedAt: activatedAt || null,
        expiryDate: expiryDate || null,
        createdAt: createdAt || new Date().toISOString(),
        updatedAt: updatedAt || new Date().toISOString(),
      });
      res.json({ success: true });
    } catch (e: any) {
      console.error("Signup error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/owners/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const rows = await db.select().from(schema.owners).where(eq(schema.owners.email, email.toLowerCase()));
      if (rows.length === 0) {
        return res.status(404).json({ message: "البريد الإلكتروني غير مسجل" });
      }
      const owner = rows[0];
      if (owner.password !== password) {
        return res.status(401).json({ message: "كلمة المرور غير صحيحة" });
      }
      res.json({ success: true, owner });
    } catch (e: any) {
      console.error("Login error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/owners", async (_req, res) => {
    try {
      const rows = await db.select().from(schema.owners);
      res.json(rows);
    } catch (e: any) {
      console.error("Get owners error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/owners/:id", async (req, res) => {
    try {
      const rows = await db.select().from(schema.owners).where(eq(schema.owners.id, req.params.id));
      if (rows.length === 0) return res.status(404).json({ message: "Not found" });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/owners/:id", async (req, res) => {
    try {
      const { name, phone, email, password, status, isActive, activatedAt, expiryDate, updatedAt } = req.body;
      const existing = await db.select().from(schema.owners).where(eq(schema.owners.id, req.params.id));
      if (existing.length > 0 && existing[0].updatedAt && updatedAt) {
        if (new Date(existing[0].updatedAt) > new Date(updatedAt)) {
          return res.json({ success: true, skipped: true });
        }
      }
      await db.update(schema.owners).set({
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(password !== undefined && { password }),
        ...(status !== undefined && { status }),
        ...(isActive !== undefined && { isActive }),
        ...(activatedAt !== undefined && { activatedAt }),
        ...(expiryDate !== undefined && { expiryDate }),
        updatedAt: updatedAt || new Date().toISOString(),
      }).where(eq(schema.owners.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/owners/:id", async (req, res) => {
    try {
      const ownerId = req.params.id;
      await db.delete(schema.subscribers).where(eq(schema.subscribers.ownerId, ownerId));
      await db.delete(schema.payments).where(eq(schema.payments.ownerId, ownerId));
      await db.delete(schema.expenses).where(eq(schema.expenses.ownerId, ownerId));
      await db.delete(schema.pricing).where(eq(schema.pricing.ownerId, ownerId));
      await db.delete(schema.owners).where(eq(schema.owners.id, ownerId));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/sync", async (req, res) => {
    try {
      const { ownerId, subscribers: subs, payments: pays, expenses: exps, pricing: prc } = req.body;

      if (!ownerId) {
        return res.status(400).json({ message: "ownerId is required" });
      }

      if (subs && Array.isArray(subs)) {
        for (const sub of subs) {
          const existing = await db.select().from(schema.subscribers)
            .where(and(eq(schema.subscribers.id, sub.id), eq(schema.subscribers.ownerId, ownerId)));
          if (existing.length > 0) {
            if (existing[0].updatedAt && sub.updatedAt && new Date(existing[0].updatedAt) > new Date(sub.updatedAt)) {
              continue;
            }
            await db.update(schema.subscribers).set({
              name: sub.name,
              phone: sub.phone,
              amperes: sub.amperes,
              tier: sub.tier,
              createdMonth: sub.createdMonth,
              updatedAt: sub.updatedAt || new Date().toISOString(),
            }).where(and(eq(schema.subscribers.id, sub.id), eq(schema.subscribers.ownerId, ownerId)));
          } else {
            await db.insert(schema.subscribers).values({
              id: sub.id,
              ownerId,
              name: sub.name,
              phone: sub.phone,
              amperes: sub.amperes,
              tier: sub.tier,
              createdMonth: sub.createdMonth,
              updatedAt: sub.updatedAt || new Date().toISOString(),
            });
          }
        }
      }

      if (pays && Array.isArray(pays)) {
        for (const pay of pays) {
          const existing = await db.select().from(schema.payments)
            .where(and(eq(schema.payments.id, pay.id), eq(schema.payments.ownerId, ownerId)));
          if (existing.length > 0) {
            if (existing[0].updatedAt && pay.updatedAt && new Date(existing[0].updatedAt) > new Date(pay.updatedAt)) {
              continue;
            }
            await db.update(schema.payments).set({
              subscriberId: pay.subscriberId,
              month: pay.month,
              amount: String(pay.amount),
              date: pay.date,
              type: pay.type,
              updatedAt: pay.updatedAt || new Date().toISOString(),
            }).where(and(eq(schema.payments.id, pay.id), eq(schema.payments.ownerId, ownerId)));
          } else {
            await db.insert(schema.payments).values({
              id: pay.id,
              ownerId,
              subscriberId: pay.subscriberId,
              month: pay.month,
              amount: String(pay.amount),
              date: pay.date,
              type: pay.type,
              updatedAt: pay.updatedAt || new Date().toISOString(),
            });
          }
        }
      }

      if (exps && Array.isArray(exps)) {
        for (const exp of exps) {
          const existing = await db.select().from(schema.expenses)
            .where(and(eq(schema.expenses.id, exp.id), eq(schema.expenses.ownerId, ownerId)));
          if (existing.length > 0) {
            if (existing[0].updatedAt && exp.updatedAt && new Date(existing[0].updatedAt) > new Date(exp.updatedAt)) {
              continue;
            }
            await db.update(schema.expenses).set({
              month: exp.month,
              description: exp.description,
              amount: String(exp.amount),
              date: exp.date,
              updatedAt: exp.updatedAt || new Date().toISOString(),
            }).where(and(eq(schema.expenses.id, exp.id), eq(schema.expenses.ownerId, ownerId)));
          } else {
            await db.insert(schema.expenses).values({
              id: exp.id,
              ownerId,
              month: exp.month,
              description: exp.description,
              amount: String(exp.amount),
              date: exp.date,
              updatedAt: exp.updatedAt || new Date().toISOString(),
            });
          }
        }
      }

      if (prc && typeof prc === "object") {
        for (const [month, prices] of Object.entries(prc)) {
          const p = prices as { gold: number; silver: number; bronze: number };
          const existing = await db.select().from(schema.pricing)
            .where(and(eq(schema.pricing.ownerId, ownerId), eq(schema.pricing.month, month)));
          if (existing.length > 0) {
            await db.update(schema.pricing).set({
              gold: String(p.gold),
              silver: String(p.silver),
              bronze: String(p.bronze),
              updatedAt: new Date().toISOString(),
            }).where(and(eq(schema.pricing.ownerId, ownerId), eq(schema.pricing.month, month)));
          } else {
            await db.insert(schema.pricing).values({
              ownerId,
              month,
              gold: String(p.gold),
              silver: String(p.silver),
              bronze: String(p.bronze),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }

      res.json({ success: true, message: "تم المزامنة بنجاح" });
    } catch (e: any) {
      console.error("Sync error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/sync/delete", async (req, res) => {
    try {
      const { entity, id, ownerId } = req.body;
      if (!entity || !id || !ownerId) {
        return res.status(400).json({ message: "entity, id, and ownerId are required" });
      }

      switch (entity) {
        case "subscriber":
          await db.delete(schema.payments).where(
            and(eq(schema.payments.subscriberId, id), eq(schema.payments.ownerId, ownerId))
          );
          await db.delete(schema.subscribers).where(
            and(eq(schema.subscribers.id, id), eq(schema.subscribers.ownerId, ownerId))
          );
          break;
        case "payment":
          await db.delete(schema.payments).where(
            and(eq(schema.payments.id, id), eq(schema.payments.ownerId, ownerId))
          );
          break;
        case "expense":
          await db.delete(schema.expenses).where(
            and(eq(schema.expenses.id, id), eq(schema.expenses.ownerId, ownerId))
          );
          break;
        default:
          return res.status(400).json({ message: `Unknown entity: ${entity}` });
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("Sync delete error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/owners/:id/data", async (req, res) => {
    try {
      const ownerId = req.params.id;
      const [subs, pays, exps, prc] = await Promise.all([
        db.select().from(schema.subscribers).where(eq(schema.subscribers.ownerId, ownerId)),
        db.select().from(schema.payments).where(eq(schema.payments.ownerId, ownerId)),
        db.select().from(schema.expenses).where(eq(schema.expenses.ownerId, ownerId)),
        db.select().from(schema.pricing).where(eq(schema.pricing.ownerId, ownerId)),
      ]);

      const pricingMap: Record<string, { gold: number; silver: number; bronze: number }> = {};
      for (const p of prc) {
        pricingMap[p.month] = {
          gold: Number(p.gold),
          silver: Number(p.silver),
          bronze: Number(p.bronze),
        };
      }

      res.json({
        subscribers: subs.map(s => ({
          id: s.id, name: s.name, phone: s.phone,
          amperes: s.amperes, tier: s.tier,
          createdMonth: s.createdMonth, updatedAt: s.updatedAt,
        })),
        payments: pays.map(p => ({
          id: p.id, subscriberId: p.subscriberId,
          month: p.month, amount: Number(p.amount),
          date: p.date, type: p.type, updatedAt: p.updatedAt,
        })),
        expenses: exps.map(e => ({
          id: e.id, month: e.month,
          description: e.description, amount: Number(e.amount),
          date: e.date, updatedAt: e.updatedAt,
        })),
        pricing: pricingMap,
      });
    } catch (e: any) {
      console.error("Get owner data error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
