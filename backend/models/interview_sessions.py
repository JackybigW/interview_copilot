from core.database import Base
from sqlalchemy import Column, DateTime, Integer, String


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
    title = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)