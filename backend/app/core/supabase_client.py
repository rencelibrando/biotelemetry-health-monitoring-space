import logging
from typing import Optional
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

supabase_client = None

if settings.SUPABASE_URL and settings.SUPABASE_KEY:
    try:
        from supabase import create_client, Client
        supabase_client: Optional[Client] = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        logger.info("Connected to Supabase PostgreSQL cloud instance.")
    except Exception as e:
        logger.warning(f"Failed to initialize Supabase client: {e}. Falling back to in-memory store.")
else:
    logger.info("Supabase credentials not configured. Running in local mock/memory mode.")

def get_supabase():
    return supabase_client

