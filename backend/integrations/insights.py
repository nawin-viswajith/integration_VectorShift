from collections import Counter
from datetime import datetime, timezone
import json


def _parse_iso(ts):
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None


def generate_insights(items, integration_type):
    total = len(items)
    type_counts = Counter([(item or {}).get("type", "unknown") for item in items])
    now = datetime.now(timezone.utc)
    timestamps = []
    stale_items = 0
    missing_name = 0
    recently_created_7d = 0
    age_buckets = {"0-7d": 0, "8-30d": 0, "31-90d": 0, "90d+": 0}
    activity_timeline = [0, 0, 0, 0]  # last 4 weeks
    contacts_missing_email = 0
    companies_missing_domain = 0
    deals_missing_stage = 0
    deals_missing_amount = 0
    deal_amount_total = 0.0

    for item in items:
        props = {}
        if (item or {}).get("delta"):
            try:
                props = json.loads(item.get("delta") or "{}")
            except json.JSONDecodeError:
                props = {}

        name = (item or {}).get("name")
        if not name:
            missing_name += 1
        item_type = (item or {}).get("type")
        if item_type == "contact" and not props.get("email"):
            contacts_missing_email += 1
        if item_type == "company" and not props.get("domain"):
            companies_missing_domain += 1
        if item_type == "deal":
            if not props.get("dealstage"):
                deals_missing_stage += 1
            amount = props.get("amount")
            if not amount:
                deals_missing_amount += 1
            else:
                try:
                    deal_amount_total += float(amount)
                except (TypeError, ValueError):
                    deals_missing_amount += 1

        ts = (item or {}).get("last_modified_time") or (item or {}).get("creation_time")
        parsed = _parse_iso(ts)
        if parsed:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            timestamps.append(parsed)
            age_days = (now - parsed).days
            if age_days <= 7:
                age_buckets["0-7d"] += 1
                recently_created_7d += 1
            elif age_days <= 30:
                age_buckets["8-30d"] += 1
            elif age_days <= 90:
                age_buckets["31-90d"] += 1
            else:
                age_buckets["90d+"] += 1

            if age_days > 30:
                stale_items += 1

            week_slot = min(age_days // 7, 3)
            activity_timeline[3 - week_slot] += 1

    latest_activity = max(timestamps).isoformat() if timestamps else None
    active_last_30_days = 0
    for ts in timestamps:
        if (now - ts).days <= 30:
            active_last_30_days += 1

    top_names = [item.get("name") for item in items if item and item.get("name")][:5]
    completeness_pct = round(((total - missing_name) / total) * 100, 1) if total else 0.0
    freshness_pct = round((active_last_30_days / total) * 100, 1) if total else 0.0
    health_score = round((0.55 * completeness_pct) + (0.45 * freshness_pct), 1)
    deal_count = type_counts.get("deal", 0)
    company_count = type_counts.get("company", 0)
    contact_count = type_counts.get("contact", 0)
    contact_to_company_ratio = round((contact_count / company_count), 2) if company_count else None
    automation_opportunity_score = min(
        100,
        round(
            (stale_items * 0.4)
            + ((missing_name + contacts_missing_email + companies_missing_domain + deals_missing_stage) * 0.3)
            + (max(total - active_last_30_days, 0) * 0.2)
            + (deal_count * 0.1)
        ),
    )
    estimated_hours_saved_monthly = round((total * 2.0) / 60.0, 1)

    narrative = (
        f"{integration_type} health score is {health_score}/100 across {total} synchronized items. "
        f"{active_last_30_days} records were active in the last 30 days and {stale_items} are stale. "
        f"Estimated manual review time saved with automation: {estimated_hours_saved_monthly} hours/month."
    )

    recommendations = []
    if stale_items:
        recommendations.append(
            f"Trigger follow-up automations for {stale_items} stale records older than 30 days."
        )
    else:
        recommendations.append(
            "Create a freshness watchdog flow to keep stale records near zero as data volume grows."
        )
    if missing_name:
        recommendations.append(
            f"Enforce required field validation: {missing_name} records are missing a display name."
        )
    else:
        recommendations.append(
            "Field quality is strong. Add enrichment workflows to keep contact and company profiles complete."
        )
    dominant = max(type_counts.items(), key=lambda x: x[1])[0] if type_counts else "unknown"
    recommendations.append(
        f"Prioritize no-code workflows on '{dominant}' objects first for highest reach."
    )
    recommendations.append(
        f"Start with one high-ROI automation lane on {deal_count} deals and scale using the same template."
    )
    if deals_missing_stage:
        recommendations.append(
            f"Backfill deal stage for {deals_missing_stage} deals to improve pipeline forecasting."
        )
    if contacts_missing_email:
        recommendations.append(
            f"Enrich {contacts_missing_email} contacts missing email before outreach automations."
        )

    return {
        "summary": narrative,
        "total_items": total,
        "health_score": health_score,
        "completeness_pct": completeness_pct,
        "freshness_pct": freshness_pct,
        "stale_items": stale_items,
        "missing_name_items": missing_name,
        "recently_created_7d": recently_created_7d,
        "counts_by_type": dict(type_counts),
        "age_buckets": age_buckets,
        "activity_timeline_last_4_weeks": activity_timeline,
        "active_last_30_days": active_last_30_days,
        "latest_activity": latest_activity,
        "top_item_names": top_names,
        "contact_to_company_ratio": contact_to_company_ratio,
        "automation_opportunity_score": automation_opportunity_score,
        "estimated_hours_saved_monthly": estimated_hours_saved_monthly,
        "contacts_missing_email": contacts_missing_email,
        "companies_missing_domain": companies_missing_domain,
        "deals_missing_stage": deals_missing_stage,
        "deals_missing_amount": deals_missing_amount,
        "deal_amount_total": round(deal_amount_total, 2),
        "recommended_actions": recommendations,
        "explainability": {
            "health_score": {
                "formula": "0.55*completeness + 0.45*freshness",
                "contributors": [
                    {"feature": "completeness_pct", "weight": 0.55, "value": completeness_pct, "impact": round(0.55 * completeness_pct, 2)},
                    {"feature": "freshness_pct", "weight": 0.45, "value": freshness_pct, "impact": round(0.45 * freshness_pct, 2)},
                ],
            },
            "automation_opportunity_score": {
                "formula": "0.4*stale + 0.3*data_gaps + 0.2*inactive + 0.1*deals (capped at 100)",
                "contributors": [
                    {"feature": "stale_items", "weight": 0.4, "value": stale_items, "impact": round(stale_items * 0.4, 2)},
                    {
                        "feature": "data_gap_items",
                        "weight": 0.3,
                        "value": (missing_name + contacts_missing_email + companies_missing_domain + deals_missing_stage),
                        "impact": round((missing_name + contacts_missing_email + companies_missing_domain + deals_missing_stage) * 0.3, 2),
                    },
                    {
                        "feature": "inactive_items_last_30d",
                        "weight": 0.2,
                        "value": max(total - active_last_30_days, 0),
                        "impact": round(max(total - active_last_30_days, 0) * 0.2, 2),
                    },
                    {"feature": "deal_count", "weight": 0.1, "value": deal_count, "impact": round(deal_count * 0.1, 2)},
                ],
            },
        },
    }
