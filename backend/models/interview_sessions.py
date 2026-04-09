from datetime import datetime
from typing import Any, Dict, Optional

from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def build_interview_session_title(
    company: Optional[str],
    job_title: Optional[str],
    created_at: Optional[datetime] = None,
) -> str:
    timestamp = (created_at or datetime.now()).strftime("%Y-%m-%d %H:%M")
    parts = []

    company_name = _normalize_text(company)
    role_title = _normalize_text(job_title)

    if company_name:
        parts.append(company_name)
    if role_title:
        parts.append(role_title)

    if parts:
        return " · ".join([*parts, timestamp])
    return f"Interview {timestamp}"


def prepare_interview_session_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(data)

    company = _normalize_text(payload.get("company"))
    job_title = _normalize_text(payload.get("job_title"))
    created_at = payload.get("created_at") or datetime.now()

    payload["company"] = company
    payload["job_title"] = job_title
    payload["created_at"] = created_at

    if not _normalize_text(payload.get("title")):
        payload["title"] = build_interview_session_title(company, job_title, created_at)

    return payload


class Interview_sessions(Base):
    __tablename__ = "interview_sessions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True, autoincrement=True, nullable=False)
    user_id = Column(String, nullable=False)
    resume_key = Column(String, nullable=True)
    jd_key = Column(String, nullable=True)
    resume_text = Column(String, nullable=True)
    jd_text = Column(String, nullable=True)
    resume_summary = Column(String, nullable=True)
    jd_summary = Column(String, nullable=True)
    language = Column(String, nullable=True)
    transcript = Column(String, nullable=True)
    ai_responses = Column(String, nullable=True)
    status = Column(String, nullable=True)
    duration = Column(Integer, nullable=True)
    company = Column(String, nullable=True)
    job_title = Column(String, nullable=True)
    title = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
