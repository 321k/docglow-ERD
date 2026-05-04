"""BigQuery-backed model usage enrichment."""

from __future__ import annotations

import calendar
import logging
import os
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

logger = logging.getLogger(__name__)

BIGQUERY_MODEL_USAGE_USER_EMAILS_ENV_VAR = "BIGQUERY_MODEL_USAGE_USER_EMAILS"
LEGACY_MODEL_USAGE_USER_EMAIL_ENV_VAR = "DOCGLOW_MODEL_USAGE_USER_EMAIL"


def enrich_models_with_bigquery_usage(
    models: dict[str, dict[str, Any]],
    *,
    table_name: str,
) -> dict[str, dict[str, Any]]:
    """Return models with BigQuery usage stats attached.

    Matches warehouse records to models by ``model_name == model["name"]``.
    Models without matching usage still receive a zero-filled usage payload so
    the UI can render consistently when enrichment is enabled.
    """
    monthly_counts, daily_counts = _fetch_usage_data(table_name=table_name)
    today = date.today()
    series_start = _subtract_months(today, 3)

    result: dict[str, dict[str, Any]] = {}
    for model_id, model in models.items():
        model_name = str(model.get("name", ""))
        usage = {
            "queries_past_30_days": monthly_counts.get(model_name, 0),
            "daily_queries_past_3_months": _build_daily_series(
                daily_counts.get(model_name, {}),
                start_date=series_start,
                end_date=today,
            ),
        }
        result[model_id] = {**model, "usage": usage}

    return result


def _fetch_usage_data(
    *,
    table_name: str,
) -> tuple[dict[str, int], dict[str, dict[date, int]]]:
    """Fetch monthly and daily usage aggregates from BigQuery."""
    try:
        from google.cloud import bigquery
    except ImportError as e:
        raise RuntimeError(
            "google-cloud-bigquery is required for model usage enrichment. "
            "Install it before using --model-usage-table."
        ) from e

    user_emails = _get_user_emails_from_env()
    if not user_emails:
        raise RuntimeError(
            "Model usage enrichment requires the "
            f"{BIGQUERY_MODEL_USAGE_USER_EMAILS_ENV_VAR} environment variable "
            f"(or legacy {LEGACY_MODEL_USAGE_USER_EMAIL_ENV_VAR})."
        )

    client = bigquery.Client()
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("user_emails", "STRING", user_emails),
        ]
    )

    monthly_sql = f"""
        SELECT
            model_name,
            COUNT(*) AS query_count
        FROM `{table_name}`
        WHERE user_email IN UNNEST(@user_emails)
          AND model_name IS NOT NULL
          AND query_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH)
        GROUP BY 1
    """
    daily_sql = f"""
        SELECT
            model_name,
            query_date,
            COUNT(*) AS query_count
        FROM `{table_name}`
        WHERE user_email IN UNNEST(@user_emails)
          AND model_name IS NOT NULL
          AND query_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
        GROUP BY 1, 2
        ORDER BY 1, 2
    """

    monthly_counts: dict[str, int] = {}
    for row in client.query(monthly_sql, job_config=job_config).result():
        model_name = str(row["model_name"])
        monthly_counts[model_name] = int(row["query_count"])

    daily_counts: dict[str, dict[date, int]] = defaultdict(dict)
    for row in client.query(daily_sql, job_config=job_config).result():
        model_name = str(row["model_name"])
        query_date = _coerce_date(row["query_date"])
        daily_counts[model_name][query_date] = int(row["query_count"])

    logger.info("Fetched usage stats for %d models", len(daily_counts))
    return monthly_counts, dict(daily_counts)


def _get_user_emails_from_env() -> list[str]:
    """Read configured usage user emails from env vars."""
    raw_value = os.environ.get(BIGQUERY_MODEL_USAGE_USER_EMAILS_ENV_VAR)
    if raw_value is None:
        raw_value = os.environ.get(LEGACY_MODEL_USAGE_USER_EMAIL_ENV_VAR, "")

    return [part.strip() for part in raw_value.split(",") if part.strip()]


def _build_daily_series(
    counts_by_date: dict[date, int],
    *,
    start_date: date,
    end_date: date,
) -> list[dict[str, Any]]:
    """Expand sparse daily counts into a zero-filled contiguous series."""
    days = (end_date - start_date).days
    return [
        {
            "date": (start_date + timedelta(days=offset)).isoformat(),
            "query_count": counts_by_date.get(start_date + timedelta(days=offset), 0),
        }
        for offset in range(days + 1)
    ]


def _coerce_date(value: Any) -> date:
    """Convert BigQuery row values to ``date``."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _subtract_months(value: date, months: int) -> date:
    """Subtract calendar months from a date while clamping the day."""
    total_months = value.year * 12 + (value.month - 1) - months
    year = total_months // 12
    month = total_months % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)
