"""
Script to list all tables in the database.
"""

import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from prisma import Prisma

async def list_tables():
    """List all tables in the database."""
    
    db = Prisma()
    await db.connect()
    
    try:
        print("Listing all tables in the database...")
        print("="*60)
        
        # Get all tables
        tables = await db.query_raw("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)
        
        print("\nTables found:")
        for table in tables:
            print(f"  - {table['table_name']}")
        
        print(f"\nTotal: {len(tables)} tables")
        
    except Exception as e:
        print(f"❌ Error listing tables: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(list_tables())
