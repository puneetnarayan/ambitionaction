const { Pool } = require("pg");

let pool;
function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 7000,
  });
  return pool;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const pool = db();
  if (req.method === "GET") {
    const [a, w, s] = await Promise.all([
      pool.query("SELECT id, activity_key, category, heading, guidance, display_order, is_completed FROM public.aa_activities ORDER BY display_order, activity_key"),
      pool.query("SELECT id, activity_id, work_text, display_order FROM public.aa_action_work ORDER BY display_order, created_at"),
      pool.query("SELECT id, activity_id, work_id, subtask_text, is_completed, display_order FROM public.aa_subtasks ORDER BY activity_id, display_order, created_at")
    ]);
    const workByActivity = new Map();
    for (const row of w.rows) if (!workByActivity.has(row.activity_id)) workByActivity.set(row.activity_id, row);
    const subtasksByActivity = new Map();
    for (const row of s.rows) {
      if (!subtasksByActivity.has(row.activity_id)) subtasksByActivity.set(row.activity_id, []);
      subtasksByActivity.get(row.activity_id).push({
        id: row.id, text: row.subtask_text, done: row.is_completed, workId: row.work_id
      });
    }
    return res.status(200).json({
      activities: a.rows.map(row => {
        const work = workByActivity.get(row.id);
        return {
          id: row.activity_key, group: row.category, title: row.heading,
          guidance: row.guidance || "", done: row.is_completed,
          actionText: work ? work.work_text : "",
          workId: work ? work.id : null,
          subtasks: subtasksByActivity.get(row.id) || []
        };
      })
    });
  }

  const incoming = req.body && req.body.activities;
  if (!Array.isArray(incoming) || incoming.length !== 20) {
    return res.status(400).json({ error: "Expected all 20 activities" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const item of incoming) {
      if (!/^a([1-9]|1[0-9]|20)$/.test(String(item.id)) ||
          typeof item.title !== "string" || !Array.isArray(item.subtasks) ||
          typeof item.actionText !== "string") {
        throw new Error("Invalid activity payload");
      }
      const key = item.id;
      const upsert = await client.query(
        `INSERT INTO public.aa_activities
          (activity_key, category, heading, guidance, display_order, is_completed, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (activity_key) DO UPDATE SET
          category=EXCLUDED.category, heading=EXCLUDED.heading,
          guidance=EXCLUDED.guidance, display_order=EXCLUDED.display_order,
          is_completed=EXCLUDED.is_completed, updated_at=NOW()
         RETURNING id`,
        [key, item.group || "", item.title, item.guidance || "", Number(key.slice(1)), !!item.done]
      );
      const activityId = upsert.rows[0].id;
      let workId = null;
      if (item.actionText.trim()) {
        const existingWork = await client.query(
          "SELECT id FROM public.aa_action_work WHERE activity_id=$1 ORDER BY created_at, id LIMIT 1",
          [activityId]
        );
        if (existingWork.rowCount) {
          workId = existingWork.rows[0].id;
          await client.query(
            "UPDATE public.aa_action_work SET work_text=$1, updated_at=NOW() WHERE id=$2",
            [item.actionText, workId]
          );
        } else {
          const inserted = await client.query(
            "INSERT INTO public.aa_action_work (activity_id, work_text, display_order) VALUES ($1,$2,0) RETURNING id",
            [activityId, item.actionText]
          );
          workId = inserted.rows[0].id;
        }
      } else {
        await client.query("DELETE FROM public.aa_action_work WHERE activity_id=$1", [activityId]);
      }

      const retained = [];
      for (let i = 0; i < item.subtasks.length; i++) {
        const st = item.subtasks[i];
        if (!st || typeof st.text !== "string") throw new Error("Invalid subtask payload");
        if (!st.text.trim()) continue;
        if (st.id) {
          const updated = await client.query(
            `UPDATE public.aa_subtasks SET subtask_text=$1, is_completed=$2,
              display_order=$3, work_id=$4, updated_at=NOW()
             WHERE id=$5 AND activity_id=$6 RETURNING id`,
            [st.text, !!st.done, i, workId, st.id, activityId]
          );
          if (updated.rowCount) { retained.push(updated.rows[0].id); continue; }
        }
        const inserted = await client.query(
          `INSERT INTO public.aa_subtasks
            (activity_id, work_id, subtask_text, is_completed, display_order)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [activityId, workId, st.text, !!st.done, i]
        );
        retained.push(inserted.rows[0].id);
      }
      if (retained.length) {
        await client.query(
          "DELETE FROM public.aa_subtasks WHERE activity_id=$1 AND NOT (id = ANY($2::uuid[]))",
          [activityId, retained]
        );
      } else {
        await client.query("DELETE FROM public.aa_subtasks WHERE activity_id=$1", [activityId]);
      }
    }
    await client.query("COMMIT");
    return res.status(200).json({ saved: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("AmbitionAction save failed:", error.message);
    return res.status(400).json({ error: "Could not save activities" });
  } finally {
    client.release();
  }
};