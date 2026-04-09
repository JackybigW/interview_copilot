from datetime import datetime
from types import SimpleNamespace

import pytest


def test_build_interview_session_title_variants():
    from models.interview_sessions import build_interview_session_title

    created_at = datetime(2026, 4, 9, 13, 5)

    assert (
        build_interview_session_title("Acme", "Backend Engineer", created_at)
        == "Acme · Backend Engineer · 2026-04-09 13:05"
    )
    assert (
        build_interview_session_title("Acme", None, created_at)
        == "Acme · 2026-04-09 13:05"
    )
    assert (
        build_interview_session_title(None, "Backend Engineer", created_at)
        == "Backend Engineer · 2026-04-09 13:05"
    )
    assert build_interview_session_title(None, None, created_at) == "Interview 2026-04-09 13:05"


@pytest.mark.asyncio
async def test_entity_create_persists_metadata_and_derives_title(monkeypatch):
    import routers.interview_sessions as session_router

    captured = {}

    class FakeService:
        def __init__(self, db):
            self.db = db

        async def create(self, data, user_id=None):
            captured["data"] = data
            captured["user_id"] = user_id
            return SimpleNamespace(
                id=7,
                title=data["title"],
                company=data.get("company"),
                job_title=data.get("job_title"),
                created_at=data.get("created_at"),
            )

    monkeypatch.setattr(session_router, "Interview_sessionsService", FakeService)

    response = await session_router.create_interview_sessions(
        session_router.Interview_sessionsData(
            resume_text="resume",
            jd_text="jd",
            company="Acme",
            job_title="Backend Engineer",
        ),
        current_user=SimpleNamespace(id="user-1"),
        db=SimpleNamespace(),
    )

    assert captured["user_id"] == "user-1"
    assert captured["data"]["company"] == "Acme"
    assert captured["data"]["job_title"] == "Backend Engineer"
    assert captured["data"]["title"].startswith("Acme · Backend Engineer · 2026-04-09")
    assert response.id == 7


@pytest.mark.asyncio
async def test_anonymous_create_persists_metadata_and_derives_title(monkeypatch):
    import routers.interview as interview

    captured = {}

    class FakeService:
        def __init__(self, db):
            self.db = db

        async def create(self, data, user_id=None):
            captured["data"] = data
            captured["user_id"] = user_id
            return SimpleNamespace(
                id=11,
                title=data["title"],
                company=data.get("company"),
                job_title=data.get("job_title"),
                created_at=data.get("created_at"),
            )

    monkeypatch.setattr(interview, "Interview_sessionsService", FakeService)

    response = await interview.create_session(
        interview.CreateSessionRequest(
            resume_text="resume",
            jd_text="jd",
            company="Acme",
            job_title="Backend Engineer",
        ),
        db=SimpleNamespace(),
    )

    assert captured["user_id"] == "anonymous"
    assert captured["data"]["company"] == "Acme"
    assert captured["data"]["job_title"] == "Backend Engineer"
    assert captured["data"]["title"].startswith("Acme · Backend Engineer · ")
    assert response["id"] == 11
    assert response["title"] == captured["data"]["title"]


def test_session_schemas_expose_company_and_job_title():
    import routers.interview as interview
    import routers.interview_sessions as session_router

    create_request = interview.CreateSessionRequest(company="Acme", job_title="Backend Engineer")
    assert create_request.company == "Acme"
    assert create_request.job_title == "Backend Engineer"

    create_data = session_router.Interview_sessionsData(company="Acme", job_title="Backend Engineer")
    update_data = session_router.Interview_sessionsUpdateData(company="Acme", job_title="Backend Engineer")
    response = session_router.Interview_sessionsResponse(
        id=1,
        user_id="user-1",
        company="Acme",
        job_title="Backend Engineer",
        title="Acme · Backend Engineer · 2026-04-09 13:05",
    )
    listing = session_router.Interview_sessionsListResponse(items=[response], total=1, skip=0, limit=20)

    assert create_data.company == "Acme"
    assert create_data.job_title == "Backend Engineer"
    assert update_data.company == "Acme"
    assert update_data.job_title == "Backend Engineer"
    assert response.company == "Acme"
    assert response.job_title == "Backend Engineer"
    assert response.title == "Acme · Backend Engineer · 2026-04-09 13:05"
    assert listing.items[0].company == "Acme"
    assert listing.items[0].job_title == "Backend Engineer"
