const { applications: appsRepo } = require('../repositories');
const { query } = require('../db');
const { STATUS } = require('../statusMachine');

async function board(filters = {}) {
  const items = await appsRepo.query(filters);
  const counts = await appsRepo.counts();
  return { items, counts };
}

async function slaSummary() {
  const now = new Date();
  const { rows } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('submitted','under_review'))                                   AS open_total,
      COUNT(*) FILTER (WHERE status IN ('submitted','under_review') AND review_due_at < NOW())         AS overdue,
      COUNT(*) FILTER (WHERE status IN ('submitted','under_review') AND review_due_at BETWEEN NOW() AND NOW() + INTERVAL '6 hours') AS due_soon,
      COUNT(*) FILTER (WHERE status = 'needs_correction' AND correction_due_at < NOW())                 AS correction_overdue,
      AVG(EXTRACT(EPOCH FROM (decided_at - submitted_at))/3600)
        FILTER (WHERE decided_at IS NOT NULL AND submitted_at IS NOT NULL AND decided_at > NOW() - INTERVAL '30 days') AS avg_review_hours_30d
    FROM applications
    WHERE deleted_at IS NULL
  `);
  return {
    now: now.toISOString(),
    openTotal: parseInt(rows[0].open_total, 10),
    overdue: parseInt(rows[0].overdue, 10),
    dueSoon: parseInt(rows[0].due_soon, 10),
    correctionOverdue: parseInt(rows[0].correction_overdue, 10),
    avgReviewHours30d: rows[0].avg_review_hours_30d ? parseFloat(rows[0].avg_review_hours_30d).toFixed(2) : null,
  };
}

async function reviewerWorkload() {
  const { rows } = await query(`
    SELECT u.id, u.name,
           COUNT(a.id) FILTER (WHERE a.status IN ('submitted','under_review')) AS open,
           COUNT(a.id) FILTER (WHERE a.status = 'approved' AND a.decided_at > NOW() - INTERVAL '7 days') AS approved_7d,
           COUNT(a.id) FILTER (WHERE a.status = 'rejected' AND a.decided_at > NOW() - INTERVAL '7 days') AS rejected_7d
    FROM users u
    LEFT JOIN applications a ON a.reviewer_id = u.id AND a.deleted_at IS NULL
    WHERE u.role = 'reviewer' AND u.deleted_at IS NULL
    GROUP BY u.id ORDER BY open DESC
  `);
  return rows.map((r) => ({
    id: r.id, name: r.name,
    open: parseInt(r.open, 10),
    approved7d: parseInt(r.approved_7d, 10),
    rejected7d: parseInt(r.rejected_7d, 10),
  }));
}

module.exports = { board, slaSummary, reviewerWorkload, STATUS };
