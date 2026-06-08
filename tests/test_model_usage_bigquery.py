from __future__ import annotations

import sys
from datetime import date
from types import ModuleType

from docglow.usage.bigquery import (
    BIGQUERY_MODEL_USAGE_USER_EMAILS_ENV_VAR,
    LEGACY_MODEL_USAGE_USER_EMAIL_ENV_VAR,
    _get_user_emails_from_env,
    enrich_models_with_bigquery_usage,
)


class FakeQueryJob:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows

    def result(self) -> list[dict[str, object]]:
        return self._rows


class FakeClient:
    def __init__(
        self, monthly_rows: list[dict[str, object]], daily_rows: list[dict[str, object]]
    ) -> None:
        self._monthly_rows = monthly_rows
        self._daily_rows = daily_rows
        self.queries: list[str] = []
        self.job_configs: list[object | None] = []

    def query(self, sql: str, job_config: object | None = None) -> FakeQueryJob:
        self.queries.append(sql)
        self.job_configs.append(job_config)
        if "INTERVAL 1 MONTH" in sql:
            return FakeQueryJob(self._monthly_rows)
        return FakeQueryJob(self._daily_rows)


def test_enrich_models_with_bigquery_usage_adds_zero_filled_series(monkeypatch) -> None:
    monthly_rows = [{"model_name": "orders", "query_count": 38}]
    daily_rows = [
        {"model_name": "orders", "query_date": date(2026, 2, 4), "query_count": 2},
        {"model_name": "orders", "query_date": date(2026, 2, 6), "query_count": 5},
    ]
    fake_client = FakeClient(monthly_rows, daily_rows)

    fake_bigquery = ModuleType("google.cloud.bigquery")
    fake_bigquery.Client = lambda: fake_client
    fake_bigquery.QueryJobConfig = lambda query_parameters: {"query_parameters": query_parameters}
    fake_bigquery.ArrayQueryParameter = lambda name, type_, values: (name, type_, values)

    fake_google = ModuleType("google")
    fake_google_cloud = ModuleType("google.cloud")
    fake_google_cloud.bigquery = fake_bigquery
    fake_google.cloud = fake_google_cloud  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "google", fake_google)
    monkeypatch.setitem(sys.modules, "google.cloud", fake_google_cloud)
    monkeypatch.setitem(sys.modules, "google.cloud.bigquery", fake_bigquery)
    monkeypatch.setattr("docglow.usage.bigquery.date", FakeDate)
    monkeypatch.setenv(
        BIGQUERY_MODEL_USAGE_USER_EMAILS_ENV_VAR,
        "metabase@example.com, analytics@example.com ",
    )

    models = {
        "model.pkg.orders": {"name": "orders"},
        "model.pkg.customers": {"name": "customers"},
    }

    enriched = enrich_models_with_bigquery_usage(
        models,
        table_name="dataset.model_consumption",
    )

    orders_usage = enriched["model.pkg.orders"]["usage"]
    assert orders_usage["queries_past_30_days"] == 38
    assert orders_usage["daily_queries_past_3_months"][0] == {
        "date": "2026-02-04",
        "query_count": 2,
    }
    assert orders_usage["daily_queries_past_3_months"][1] == {
        "date": "2026-02-05",
        "query_count": 0,
    }
    assert orders_usage["daily_queries_past_3_months"][2] == {
        "date": "2026-02-06",
        "query_count": 5,
    }

    customers_usage = enriched["model.pkg.customers"]["usage"]
    assert customers_usage["queries_past_30_days"] == 0
    assert all(
        point["query_count"] == 0 for point in customers_usage["daily_queries_past_3_months"]
    )
    assert len(fake_client.queries) == 2
    assert all("IN UNNEST(@user_emails)" in query for query in fake_client.queries)
    assert fake_client.job_configs == [
        {
            "query_parameters": [
                ("user_emails", "STRING", ["metabase@example.com", "analytics@example.com"])
            ]
        },
        {
            "query_parameters": [
                ("user_emails", "STRING", ["metabase@example.com", "analytics@example.com"])
            ]
        },
    ]


def test_enrich_models_with_bigquery_usage_requires_env_var(monkeypatch) -> None:
    monkeypatch.delenv(BIGQUERY_MODEL_USAGE_USER_EMAILS_ENV_VAR, raising=False)
    monkeypatch.delenv(LEGACY_MODEL_USAGE_USER_EMAIL_ENV_VAR, raising=False)

    try:
        enrich_models_with_bigquery_usage({}, table_name="dataset.model_consumption")
    except RuntimeError as exc:
        assert BIGQUERY_MODEL_USAGE_USER_EMAILS_ENV_VAR in str(exc)
    else:
        raise AssertionError("Expected RuntimeError when env var is missing")


def test_enrich_models_with_bigquery_usage_falls_back_to_legacy_env(monkeypatch) -> None:
    monkeypatch.delenv(BIGQUERY_MODEL_USAGE_USER_EMAILS_ENV_VAR, raising=False)
    monkeypatch.setenv(
        LEGACY_MODEL_USAGE_USER_EMAIL_ENV_VAR,
        "legacy@example.com, second@example.com",
    )

    assert _get_user_emails_from_env() == ["legacy@example.com", "second@example.com"]


class FakeDate(date):
    @classmethod
    def today(cls) -> "FakeDate":
        return cls(2026, 5, 4)
