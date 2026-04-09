"""Pydantic schemas for structured resume and JD extraction via GLM-5."""

from pydantic import BaseModel, Field, field_validator
from typing import Optional


def _flatten_to_str(v: object) -> str:
    """Convert any value to a plain string.
    Handles dicts like {'skill_name': 'Python', 'category': '技术能力'} → 'Python'
    or {'area': 'some focus area', 'detail': '...'} → 'some focus area: ...'
    """
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        # Try common key patterns: take the first meaningful value
        for key in ('name', 'skill_name', 'skill', 'area', 'point', 'description',
                     'certification', 'keyword', 'responsibility', 'achievement',
                     'education', 'tech', 'tool', 'value', 'content', 'title', 'text'):
            if key in v:
                val = str(v[key])
                # Append detail/category if present for richer context
                detail_keys = [k for k in v if k != key]
                extras = []
                for dk in detail_keys:
                    dv = v[dk]
                    if dv and str(dv).strip():
                        extras.append(str(dv).strip())
                if extras:
                    return f"{val} ({', '.join(extras)})"
                return val
        # Fallback: join all values
        vals = [str(x) for x in v.values() if x]
        return ' - '.join(vals) if vals else str(v)
    return str(v)


def _flatten_str_list(v: object) -> list[str]:
    """Validate and flatten a list that should contain strings but may contain dicts."""
    if v is None:
        return []
    if not isinstance(v, list):
        return [_flatten_to_str(v)]
    return [_flatten_to_str(item) for item in v]


class Project(BaseModel):
    """A single project from the candidate's resume."""
    name: Optional[str] = Field(default="", description="Project name")
    role: Optional[str] = Field(default="", description="Candidate's role in the project")
    tech_stack: Optional[list[str]] = Field(default_factory=list, description="Technologies used")
    highlights: Optional[list[str]] = Field(default_factory=list, description="Key achievements or contributions, quantified if possible")

    @field_validator('tech_stack', 'highlights', mode='before')
    @classmethod
    def flatten_lists(cls, v: object) -> list[str]:
        return _flatten_str_list(v)


class WorkExperience(BaseModel):
    """A single work experience entry."""
    company: Optional[str] = Field(default="", description="Company name")
    title: Optional[str] = Field(default="", description="Job title")
    duration: Optional[str] = Field(default="", description="Duration, e.g. '2022.06 - 2024.03'")
    key_responsibilities: Optional[list[str]] = Field(default_factory=list, description="Main responsibilities")
    achievements: Optional[list[str]] = Field(default_factory=list, description="Quantified achievements")

    @field_validator('key_responsibilities', 'achievements', mode='before')
    @classmethod
    def flatten_lists(cls, v: object) -> list[str]:
        return _flatten_str_list(v)


class ResumeProfile(BaseModel):
    """Structured profile extracted from a candidate's resume.
    Focus on hard skills, projects, tech stack, and quantifiable achievements."""

    candidate_name: Optional[str] = Field(default="", description="Candidate's name if available")
    years_of_experience: Optional[str] = Field(default="", description="Total years of experience, e.g. '5 years'")

    technical_skills: Optional[list[str]] = Field(
        default_factory=list,
        description="All technical/hard skills: programming languages, frameworks, tools, platforms, databases, cloud services, etc."
    )
    soft_skills: Optional[list[str]] = Field(
        default_factory=list,
        description="Soft skills: leadership, communication, teamwork, etc."
    )
    projects: Optional[list[Project]] = Field(
        default_factory=list,
        description="Key projects with tech stack and achievements. Extract top 3-5 most impressive ones."
    )
    work_experiences: Optional[list[WorkExperience]] = Field(
        default_factory=list,
        description="Work experience entries, most recent first"
    )
    education: Optional[list[str]] = Field(
        default_factory=list,
        description="Education background, e.g. 'MS Computer Science, Stanford University, 2020'"
    )
    strongest_points: Optional[list[str]] = Field(
        default_factory=list,
        description="Top 3-5 strongest selling points for interviews, based on the resume content"
    )
    certifications: Optional[list[str]] = Field(
        default_factory=list,
        description="Professional certifications, e.g. 'AWS Solutions Architect', 'PMP'"
    )

    @field_validator('technical_skills', 'soft_skills', 'education', 'strongest_points', 'certifications', mode='before')
    @classmethod
    def flatten_lists(cls, v: object) -> list[str]:
        return _flatten_str_list(v)


class JDRequirement(BaseModel):
    """A single requirement from the job description."""
    description: Optional[str] = Field(default="", description="The requirement description")
    is_required: Optional[bool] = Field(default=True, description="True if mandatory/required, False if preferred/recommended/nice-to-have")

    @field_validator('description', mode='before')
    @classmethod
    def flatten_desc(cls, v: object) -> str:
        if isinstance(v, dict):
            return _flatten_to_str(v)
        return str(v) if v else ""


class JDProfile(BaseModel):
    """Structured profile extracted from a job description.
    Focus on hard requirements, recommended qualifications, and key technical skills."""

    job_title: Optional[str] = Field(default="", description="Job title")
    company: Optional[str] = Field(default="", description="Company name if available")
    team: Optional[str] = Field(default="", description="Team or department if mentioned")
    level: Optional[str] = Field(default="", description="Seniority level: Junior/Mid/Senior/Staff/Principal/Lead/Manager")

    required_skills: Optional[list[str]] = Field(
        default_factory=list,
        description="Must-have technical skills explicitly stated as required"
    )
    preferred_skills: Optional[list[str]] = Field(
        default_factory=list,
        description="Nice-to-have/preferred/recommended technical skills"
    )
    requirements: Optional[list[JDRequirement]] = Field(
        default_factory=list,
        description="All requirements, each marked as required or preferred"
    )
    responsibilities: Optional[list[str]] = Field(
        default_factory=list,
        description="Main job responsibilities and duties"
    )
    interview_focus_areas: Optional[list[str]] = Field(
        default_factory=list,
        description="Topics the interviewer is most likely to ask about, based on the JD emphasis"
    )
    keywords: Optional[list[str]] = Field(
        default_factory=list,
        description="Important domain/technical terms the candidate should naturally use in answers"
    )
    tech_stack: Optional[list[str]] = Field(
        default_factory=list,
        description="Full technology stack mentioned in the JD"
    )
    years_experience_required: Optional[str] = Field(
        default="",
        description="Required years of experience, e.g. '3+ years'"
    )

    @field_validator('required_skills', 'preferred_skills', 'responsibilities',
                     'interview_focus_areas', 'keywords', 'tech_stack', mode='before')
    @classmethod
    def flatten_lists(cls, v: object) -> list[str]:
        return _flatten_str_list(v)