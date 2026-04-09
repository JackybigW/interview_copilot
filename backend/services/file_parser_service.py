"""File parsing service for extracting text from uploaded resume files.

Supports: PDF, DOC/DOCX, MD, TXT
"""

import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def parse_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber."""
    import pdfplumber

    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def parse_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX bytes using python-docx."""
    from docx import Document

    doc = Document(io.BytesIO(file_bytes))
    text_parts = []
    for para in doc.paragraphs:
        if para.text.strip():
            text_parts.append(para.text)
    # Also extract text from tables
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                text_parts.append(row_text)
    return "\n".join(text_parts)


def parse_markdown(file_bytes: bytes) -> str:
    """Extract text from Markdown bytes (return as-is, it's already text)."""
    return file_bytes.decode("utf-8", errors="replace")


def parse_text(file_bytes: bytes) -> str:
    """Extract text from plain text bytes."""
    return file_bytes.decode("utf-8", errors="replace")


def parse_file(file_bytes: bytes, filename: str) -> str:
    """Parse a file and extract text based on its extension.
    
    Args:
        file_bytes: Raw file bytes
        filename: Original filename (used to determine format)
    
    Returns:
        Extracted text content
    
    Raises:
        ValueError: If file format is not supported
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    parsers = {
        "pdf": parse_pdf,
        "docx": parse_docx,
        "doc": parse_docx,  # python-docx can handle some .doc files
        "md": parse_markdown,
        "markdown": parse_markdown,
        "txt": parse_text,
        "text": parse_text,
    }

    parser = parsers.get(ext)
    if not parser:
        raise ValueError(
            f"Unsupported file format: .{ext}. "
            f"Supported formats: {', '.join(f'.{k}' for k in parsers.keys())}"
        )

    try:
        text = parser(file_bytes)
        if not text.strip():
            raise ValueError("No text could be extracted from the file. The file may be empty or image-based.")
        logger.info(f"Parsed {filename}: {len(text)} characters extracted")
        return text
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"File parsing error for {filename}: {e}")
        raise ValueError(f"Failed to parse {filename}: {str(e)}")