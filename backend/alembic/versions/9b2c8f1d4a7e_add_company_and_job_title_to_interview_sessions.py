"""add company and job title to interview_sessions

Revision ID: 9b2c8f1d4a7e
Revises: 0873b65bf412
Create Date: 2026-04-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9b2c8f1d4a7e"
down_revision: Union[str, Sequence[str], None] = "0873b65bf412"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("interview_sessions", sa.Column("company", sa.String(), nullable=True))
    op.add_column("interview_sessions", sa.Column("job_title", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("interview_sessions", "job_title")
    op.drop_column("interview_sessions", "company")
