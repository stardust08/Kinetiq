"""
Database client configuration and connection management.

This module provides the Prisma database client instance and
connection management functions for the application.
"""

from dotenv import load_dotenv
from prisma import Prisma

# Load environment variables
load_dotenv()

# Global Prisma client instance
db = Prisma()


async def connect_db():
    """
    Connect to the database.
    
    This function should be called during application startup.
    """
    await db.connect()


async def disconnect_db():
    """
    Disconnect from the database.
    
    This function should be called during application shutdown.
    """
    await db.disconnect()