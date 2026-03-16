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
      const code = (id as string).substring(0, 6).toUpperCase();
      await db.insert(schema.owners).values({
        id, name, phone, email: email.toLowerCase(), password,
        status: status || "pending",
        isActive: isActive !== undefined ? isActive : true,
        activatedAt: activatedAt || null,
        expiryDate: expiryDate || null,
        invitationCode: code,
        createdAt: createdAt || new Date().toISOString(),
        updatedAt: updatedAt || new Date().toISOString(),
      });
      res.json({ success: true, invitationCode: code });
    } catch (e: any) {
      console.error("Signup error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/signup", async (req, res) => {
    try {
      const { name, phone, email, password } = req.body;
      if (!name || !phone || !email || !password) {
        return res.status(400).json({ message: "جميع الحقول مطلوبة" });
      }
      const existing = await db.select().from(schema.owners).where(eq(schema.owners.email, email.toLowerCase()));
      if (existing.length > 0) {
        return res.status(409).json({ message: "البريد الإلكتروني مسجل مسبقاً" });
      }
      const { default: Crypto } = await import("crypto");
      const id = Crypto.randomUUID();
      const code = id.substring(0, 6).toUpperCase();
      const now = new Date().toISOString();
      await db.insert(schema.owners).values({
        id, name, phone, email: email.toLowerCase(), password,
        status: "pending",
        isActive: true,
        activatedAt: null,
        expiryDate: null,
        invitationCode: code,
        createdAt: now,
        updatedAt: now,
      });
      res.json({ success: true, invitationCode: code });
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
      if (!owner.invitationCode) {
        const code = owner.id.substring(0, 6).toUpperCase();
        await db.update(schema.owners).set({ invitationCode: code }).where(eq(schema.owners.id, owner.id));
        owner.invitationCode = code;
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

  app.get("/api/owners/by-code/:code", async (req, res) => {
    try {
      const code = req.params.code.toUpperCase();
      const rows = await db.select().from(schema.owners).where(eq(schema.owners.invitationCode, code));
      if (rows.length === 0) {
        return res.status(404).json({ message: "كود الدعوة غير صحيح" });
      }
      const owner = rows[0];
      const month = new Date().toISOString().substring(0, 7);
      const prcRows = await db.select().from(schema.pricing)
        .where(and(eq(schema.pricing.ownerId, owner.id), eq(schema.pricing.month, month)));
      const pricing = prcRows.length > 0 ? {
        gold: Number(prcRows[0].gold),
        silver: Number(prcRows[0].silver),
        bronze: Number(prcRows[0].bronze),
      } : null;
      res.json({
        ownerId: owner.id,
        ownerName: owner.name,
        invitationCode: owner.invitationCode,
        pricing,
      });
    } catch (e: any) {
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
      await db.delete(schema.payments).where(eq(schema.payments.ownerId, ownerId));
      await db.delete(schema.expenses).where(eq(schema.expenses.ownerId, ownerId));
      await db.delete(schema.pricing).where(eq(schema.pricing.ownerId, ownerId));
      await db.delete(schema.subscribers).where(eq(schema.subscribers.ownerId, ownerId));
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
              name: sub.name, phone: sub.phone, amperes: sub.amperes,
              tier: sub.tier, createdMonth: sub.createdMonth,
              updatedAt: sub.updatedAt || new Date().toISOString(),
            }).where(and(eq(schema.subscribers.id, sub.id), eq(schema.subscribers.ownerId, ownerId)));
          } else {
            await db.insert(schema.subscribers).values({
              id: sub.id, ownerId, name: sub.name, phone: sub.phone,
              amperes: sub.amperes, tier: sub.tier, createdMonth: sub.createdMonth,
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
              subscriberId: pay.subscriberId, month: pay.month,
              amount: String(pay.amount), date: pay.date, type: pay.type,
              updatedAt: pay.updatedAt || new Date().toISOString(),
            }).where(and(eq(schema.payments.id, pay.id), eq(schema.payments.ownerId, ownerId)));
          } else {
            await db.insert(schema.payments).values({
              id: pay.id, ownerId, subscriberId: pay.subscriberId,
              month: pay.month, amount: String(pay.amount),
              date: pay.date, type: pay.type,
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
              month: exp.month, description: exp.description,
              amount: String(exp.amount), date: exp.date,
              updatedAt: exp.updatedAt || new Date().toISOString(),
            }).where(and(eq(schema.expenses.id, exp.id), eq(schema.expenses.ownerId, ownerId)));
          } else {
            await db.insert(schema.expenses).values({
              id: exp.id, ownerId, month: exp.month,
              description: exp.description, amount: String(exp.amount),
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
              gold: String(p.gold), silver: String(p.silver), bronze: String(p.bronze),
              updatedAt: new Date().toISOString(),
            }).where(and(eq(schema.pricing.ownerId, ownerId), eq(schema.pricing.month, month)));
          } else {
            await db.insert(schema.pricing).values({
              ownerId, month,
              gold: String(p.gold), silver: String(p.silver), bronze: String(p.bronze),
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
          gold: Number(p.gold), silver: Number(p.silver), bronze: Number(p.bronze),
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

  app.post("/api/app-users/register", async (req, res) => {
    try {
      const { id, name, phone, email, password, invitationCode } = req.body;
      if (!id || !name || !phone || !email || !password || !invitationCode) {
        return res.status(400).json({ message: "جميع الحقول مطلوبة" });
      }
      const code = (invitationCode as string).toUpperCase();
      const ownerRows = await db.select().from(schema.owners).where(eq(schema.owners.invitationCode, code));
      if (ownerRows.length === 0) {
        return res.status(404).json({ message: "كود الدعوة غير صحيح" });
      }
      const owner = ownerRows[0];
      const existing = await db.select().from(schema.appUsers).where(eq(schema.appUsers.email, email.toLowerCase()));
      if (existing.length > 0) {
        return res.status(409).json({ message: "البريد الإلكتروني مسجل مسبقاً" });
      }
      const now = new Date().toISOString();
      const phoneStr = (phone as string).replace(/\D/g, '');
      const subRows = await db.select().from(schema.subscribers)
        .where(eq(schema.subscribers.ownerId, owner.id));
      const matchedSub = subRows.find(s => {
        const sp = s.phone.replace(/\D/g, '');
        return sp.endsWith(phoneStr.slice(-9)) || phoneStr.endsWith(sp.slice(-9));
      });
      await db.insert(schema.appUsers).values({
        id, name, phone, email: email.toLowerCase(), password,
        linkedOwnerId: owner.id,
        linkedSubscriberId: matchedSub?.id || null,
        createdAt: now,
        updatedAt: now,
      });
      res.json({
        success: true,
        user: {
          id, name, phone, email,
          linkedOwnerId: owner.id,
          linkedSubscriberId: matchedSub?.id || null,
          ownerName: owner.name,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (e: any) {
      console.error("App user register error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/app-users/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const rows = await db.select().from(schema.appUsers).where(eq(schema.appUsers.email, email.toLowerCase()));
      if (rows.length === 0) {
        return res.status(404).json({ message: "البريد الإلكتروني غير مسجل" });
      }
      const user = rows[0];
      if (user.password !== password) {
        return res.status(401).json({ message: "كلمة المرور غير صحيحة" });
      }
      const ownerRows = await db.select().from(schema.owners).where(eq(schema.owners.id, user.linkedOwnerId));
      const ownerName = ownerRows.length > 0 ? ownerRows[0].name : '';
      res.json({ success: true, user: { ...user, ownerName } });
    } catch (e: any) {
      console.error("App user login error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/app-users/:id", async (req, res) => {
    try {
      const rows = await db.select().from(schema.appUsers).where(eq(schema.appUsers.id, req.params.id));
      if (rows.length === 0) return res.status(404).json({ message: "Not found" });
      const user = rows[0];
      const ownerRows = await db.select().from(schema.owners).where(eq(schema.owners.id, user.linkedOwnerId));
      const ownerName = ownerRows.length > 0 ? ownerRows[0].name : '';
      res.json({ ...user, ownerName });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/app-users/:id/pricing", async (req, res) => {
    try {
      const rows = await db.select().from(schema.appUsers).where(eq(schema.appUsers.id, req.params.id));
      if (rows.length === 0) return res.status(404).json({ message: "Not found" });
      const user = rows[0];
      const prcRows = await db.select().from(schema.pricing)
        .where(eq(schema.pricing.ownerId, user.linkedOwnerId));
      const pricingMap: Record<string, { gold: number; silver: number; bronze: number }> = {};
      for (const p of prcRows) {
        pricingMap[p.month] = {
          gold: Number(p.gold), silver: Number(p.silver), bronze: Number(p.bronze),
        };
      }
      res.json(pricingMap);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/app-users/:id/payments", async (req, res) => {
    try {
      const rows = await db.select().from(schema.appUsers).where(eq(schema.appUsers.id, req.params.id));
      if (rows.length === 0) return res.status(404).json({ message: "Not found" });
      const user = rows[0];
      if (!user.linkedSubscriberId) return res.json([]);
      const pays = await db.select().from(schema.payments)
        .where(and(
          eq(schema.payments.ownerId, user.linkedOwnerId),
          eq(schema.payments.subscriberId, user.linkedSubscriberId)
        ));
      res.json(pays.map(p => ({
        id: p.id, month: p.month, amount: Number(p.amount), date: p.date, type: p.type,
      })));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/owners/:ownerId/app-users", async (req, res) => {
    try {
      const rows = await db.select().from(schema.appUsers)
        .where(eq(schema.appUsers.linkedOwnerId, req.params.ownerId));
      res.json(rows.map(u => ({
        id: u.id, name: u.name, phone: u.phone, email: u.email,
        linkedSubscriberId: u.linkedSubscriberId, createdAt: u.createdAt,
      })));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/app-users/:id/link-subscriber", async (req, res) => {
    try {
      const { subscriberId } = req.body;
      await db.update(schema.appUsers).set({
        linkedSubscriberId: subscriberId,
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.appUsers.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const { ownerId, title, body } = req.body;
      if (!ownerId || !title || !body) {
        return res.status(400).json({ message: "جميع الحقول مطلوبة" });
      }
      const now = new Date().toISOString();
      const { default: Crypto } = await import("crypto");
      const id = Crypto.randomUUID();
      await db.insert(schema.messages).values({ id, ownerId, title, body, createdAt: now });
      res.json({ success: true, message: { id, ownerId, title, body, createdAt: now } });
    } catch (e: any) {
      console.error("Post message error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/messages/:ownerId", async (req, res) => {
    try {
      const rows = await db.select().from(schema.messages)
        .where(eq(schema.messages.ownerId, req.params.ownerId));
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    try {
      await db.delete(schema.messages).where(eq(schema.messages.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/payment-methods", async (req, res) => {
    try {
      const { userId, userType, methodType, details, isDefault } = req.body;
      if (!userId || !userType || !methodType || !details) {
        return res.status(400).json({ message: "جميع الحقول مطلوبة" });
      }
      const { default: Crypto } = await import("crypto");
      const id = Crypto.randomUUID();
      const now = new Date().toISOString();
      const safeDetails = typeof details === 'string' ? details : JSON.stringify(details);
      await db.insert(schema.paymentMethods).values({
        id, userId, userType, methodType,
        details: safeDetails,
        isDefault: !!isDefault,
        createdAt: now, updatedAt: now,
      });
      res.json({ success: true, id });
    } catch (e: any) {
      console.error("Add payment method error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/payment-methods/:userId", async (req, res) => {
    try {
      const rows = await db.select().from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.userId, req.params.userId));
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/payment-methods/:id", async (req, res) => {
    try {
      await db.delete(schema.paymentMethods).where(eq(schema.paymentMethods.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/payouts", async (req, res) => {
    try {
      const { ownerId, amount, note } = req.body;
      if (!ownerId || !amount) {
        return res.status(400).json({ message: "ownerId و amount مطلوبان" });
      }
      const { default: Crypto } = await import("crypto");
      const id = Crypto.randomUUID();
      const now = new Date().toISOString();
      await db.insert(schema.payouts).values({
        id, ownerId, amount: String(amount),
        status: "pending", note: note || null,
        transactionId: null,
        createdAt: now, updatedAt: now,
      });
      res.json({ success: true, id });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/payouts/:ownerId", async (req, res) => {
    try {
      const rows = await db.select().from(schema.payouts)
        .where(eq(schema.payouts.ownerId, req.params.ownerId));
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(rows.map(p => ({
        id: p.id, amount: Number(p.amount), status: p.status,
        note: p.note, transactionId: p.transactionId, createdAt: p.createdAt,
      })));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
