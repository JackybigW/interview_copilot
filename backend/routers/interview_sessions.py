import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from dependencies.auth import get_current_user
from schemas.auth import UserResponse
from models.interview_sessions import (
    prepare_interview_session_payload,
)
from services.interview_sessions import Interview_sessionsService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/interview_sessions", tags=["interview_sessions"])


# ---------- Pydantic Schemas ----------
class Interview_sessionsData(BaseModel):
    """Entity data schema (for create/update)"""
    resume_key: str = None
    jd_key: str = None
    resume_text: str = None
    jd_text: str = None
    resume_summary: str = None
    jd_summary: str = None
    language: str = None
    transcript: str = None
    ai_responses: str = None
    status: str = None
    duration: int = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    title: str = None
    created_at: Optional[datetime] = None


class Interview_sessionsUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    resume_key: Optional[str] = None
    jd_key: Optional[str] = None
    resume_text: Optional[str] = None
    jd_text: Optional[str] = None
    resume_summary: Optional[str] = None
    jd_summary: Optional[str] = None
    language: Optional[str] = None
    transcript: Optional[str] = None
    ai_responses: Optional[str] = None
    status: Optional[str] = None
    duration: Optional[int] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    title: Optional[str] = None
    created_at: Optional[datetime] = None


class Interview_sessionsResponse(BaseModel):
    """Entity response schema"""
    id: int
    user_id: str
    resume_key: Optional[str] = None
    jd_key: Optional[str] = None
    resume_text: Optional[str] = None
    jd_text: Optional[str] = None
    resume_summary: Optional[str] = None
    jd_summary: Optional[str] = None
    language: Optional[str] = None
    transcript: Optional[str] = None
    ai_responses: Optional[str] = None
    status: Optional[str] = None
    duration: Optional[int] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    title: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Interview_sessionsListResponse(BaseModel):
    """List response schema"""
    items: List[Interview_sessionsResponse]
    total: int
    skip: int
    limit: int


class Interview_sessionsBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Interview_sessionsData]


class Interview_sessionsBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Interview_sessionsUpdateData


class Interview_sessionsBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Interview_sessionsBatchUpdateItem]


class Interview_sessionsBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Interview_sessionsListResponse)
async def query_interview_sessionss(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Query interview_sessionss with filtering, sorting, and pagination (user can only see their own records)"""
    logger.debug(f"Querying interview_sessionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Interview_sessionsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
            user_id=str(current_user.id),
        )
        logger.debug(f"Found {result['total']} interview_sessionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying interview_sessionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Interview_sessionsListResponse)
async def query_interview_sessionss_all(
    query: str = Query(None, description="Query conditions (JSON string)"),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query interview_sessionss with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying interview_sessionss: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Interview_sessionsService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} interview_sessionss")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error querying interview_sessionss: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Interview_sessionsResponse)
async def get_interview_sessions(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single interview_sessions by ID (user can only see their own records)"""
    logger.debug(f"Fetching interview_sessions with id: {id}, fields={fields}")
    
    service = Interview_sessionsService(db)
    try:
        result = await service.get_by_id(id, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Interview_sessions with id {id} not found")
            raise HTTPException(status_code=404, detail="Interview_sessions not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching interview_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Interview_sessionsResponse, status_code=201)
async def create_interview_sessions(
    data: Interview_sessionsData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new interview_sessions"""
    logger.debug(f"Creating new interview_sessions with data: {data}")
    
    service = Interview_sessionsService(db)
    try:
        payload = prepare_interview_session_payload(data.model_dump())
        result = await service.create(payload, user_id=str(current_user.id))
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create interview_sessions")
        
        logger.info(f"Interview_sessions created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating interview_sessions: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating interview_sessions: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Interview_sessionsResponse], status_code=201)
async def create_interview_sessionss_batch(
    request: Interview_sessionsBatchCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple interview_sessionss in a single request"""
    logger.debug(f"Batch creating {len(request.items)} interview_sessionss")
    
    service = Interview_sessionsService(db)
    results = []
    
    try:
        for item_data in request.items:
            payload = prepare_interview_session_payload(item_data.model_dump())
            result = await service.create(payload, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} interview_sessionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Interview_sessionsResponse])
async def update_interview_sessionss_batch(
    request: Interview_sessionsBatchUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update multiple interview_sessionss in a single request (requires ownership)"""
    logger.debug(f"Batch updating {len(request.items)} interview_sessionss")
    
    service = Interview_sessionsService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict, user_id=str(current_user.id))
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} interview_sessionss successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Interview_sessionsResponse)
async def update_interview_sessions(
    id: int,
    data: Interview_sessionsUpdateData,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing interview_sessions (requires ownership)"""
    logger.debug(f"Updating interview_sessions {id} with data: {data}")

    service = Interview_sessionsService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict, user_id=str(current_user.id))
        if not result:
            logger.warning(f"Interview_sessions with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Interview_sessions not found")
        
        logger.info(f"Interview_sessions {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating interview_sessions {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating interview_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_interview_sessionss_batch(
    request: Interview_sessionsBatchDeleteRequest,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple interview_sessionss by their IDs (requires ownership)"""
    logger.debug(f"Batch deleting {len(request.ids)} interview_sessionss")
    
    service = Interview_sessionsService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id, user_id=str(current_user.id))
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} interview_sessionss successfully")
        return {"message": f"Successfully deleted {deleted_count} interview_sessionss", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_interview_sessions(
    id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a single interview_sessions by ID (requires ownership)"""
    logger.debug(f"Deleting interview_sessions with id: {id}")
    
    service = Interview_sessionsService(db)
    try:
        success = await service.delete(id, user_id=str(current_user.id))
        if not success:
            logger.warning(f"Interview_sessions with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Interview_sessions not found")
        
        logger.info(f"Interview_sessions {id} deleted successfully")
        return {"message": "Interview_sessions deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting interview_sessions {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
