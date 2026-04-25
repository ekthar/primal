const { applications: appsRepo } = require('../repositories');
const { query } = require('../db');
const { STATUS } = require('../statusMachine');
const { formatPersonName, applicationDisplayId, reviewerDisplayId } = require('./identity.service');

async function board(filters = {}, actor = null) {
  const stateCode = String(filters.stateCode || actor?.stateCode || '').trim() || null;
  const items = await appsRepo.query({ ...filters, stateCode });
  const counts = await appsRepo.counts({ stateCode });
  const queueCounts = { ...counts };
  delete queueCounts[STATUS.SEASON_CLOSED];
  return {
    items: items.filter((item) => item.status !== STATUS.SEASON_CLOSED).map((item) => ({
      ...item,
      applicant_display_name: formatPersonName(item.first_name, item.last_name),
      application_display_id: applicationDisplayId(item.id),
      reviewer_display_id: item.reviewer_id ? reviewerDisplayId(item.reviewer_id) : null,
    })),
    counts: queueCounts,
  };
}

async function slaSummary(filters = {}, actor = null) {
  const now = new Date();
  const stateCode = String(filters.stateCode || actor?.stateCode || '').trim() || null;
  const where = [`a.deleted_at IS NULL`];
  const args = [];
  if (stateCode) {
    args.push(stateCode);
    where.push(`COALESCE(NULLIF(p.metadata #>> '{address,state}', ''), NULLIF(p.metadata #>> '{address,state_code}', '')) = $${args.length}`);
  }
  const { rows } = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'submitted')                                                         AS submitted_open,
      COUNT(*) FILTER (WHERE status = 'under_review')                                                      AS under_review_open,
      COUNT(*) FILTER (WHERE status IN ('submitted','under_review'))                                   AS open_total,
      COUNT(*) FILTER (WHERE status IN ('submitted','under_review') AND review_due_at < NOW())         AS overdue,
      COUNT(*) FILTER (WHERE status IN ('submitted','under_review') AND review_due_at BETWEEN NOW() AND NOW() + INTERVAL '6 hours') AS due_soon,
      COUNT(*) FILTER (WHERE status = 'needs_correction' AND correction_due_at < NOW())                 AS correction_overdue,
      AVG(EXTRACT(EPOCH FROM (review_started_at - submitted_at))/3600)
        FILTER (WHERE review_started_at IS NOT NULL AND submitted_at IS NOT NULL AND submitted_at > NOW() - INTERVAL '30 days') AS avg_first_review_hours_30d,
      AVG(EXTRACT(EPOCH FROM (decided_at - submitted_at))/3600)
        FILTER (WHERE decided_at IS NOT NULL AND submitted_at IS NOT NULL AND decided_at > NOW() - INTERVAL '30 days') AS avg_review_hours_30d
    FROM applications a
    JOIN profiles p ON p.id = a.profile_id
    WHERE ${where.join(' AND ')}
  `, args);
  return {
    now: now.toISOString(),
    submittedOpen: parseInt(rows[0].submitted_open, 10),
    underReviewOpen: parseInt(rows[0].under_review_open, 10),
    openTotal: parseInt(rows[0].open_total, 10),
    overdue: parseInt(rows[0].overdue, 10),
    dueSoon: parseInt(rows[0].due_soon, 10),
    correctionOverdue: parseInt(rows[0].correction_overdue, 10),
    avgFirstReviewHours30d: rows[0].avg_first_review_hours_30d ? parseFloat(rows[0].avg_first_review_hours_30d).toFixed(2) : null,
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
    id: r.id,
    name: r.name,
    reviewerDisplayId: reviewerDisplayId(r.id),
    open: parseInt(r.open, 10),
    approved7d: parseInt(r.approved_7d, 10),
    rejected7d: parseInt(r.rejected_7d, 10),
  }));
}

module.exports = { board, slaSummary, reviewerWorkload, STATUS };
