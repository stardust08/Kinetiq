"""
Script to check the current database schema for the Booking table.
"""

import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from prisma import Prisma

async def check_schema():
    """Check the Booking table schema."""
    
    db = Prisma()
    await db.connect()
    
    try:
        print("Checking Booking table schema...")
        print("="*60)
        
        # Get column information
        columns = await db.query_raw("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'Booking'
            ORDER BY ordinal_position;
        """)
        
        print("\nBooking table columns:")
        for col in columns:
            nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
            default = f" DEFAULT {col['column_default']}" if col['column_default'] else ""
            print(f"  - {col['column_name']}: {col['data_type']} {nullable}{default}")
        
        # Check for screening count columns
        screening_cols = [col for col in columns if 'screening' in col['column_name'].lower()]
        
        if screening_cols:
            print(f"\n✓ Found {len(screening_cols)} screening count columns")
        else:
            print("\n⚠️  No screening count columns found!")
            print("   The migration may not have been applied yet.")
        
        # Check for existing constraints
        print("\n" + "="*60)
        print("Checking existing constraints...")
        constraints = await db.query_raw("""
            SELECT conname, pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = '"Booking"'::regclass;
        """)
        
        print("\nExisting constraints on Booking table:")
        for constraint in constraints:
            print(f"  - {constraint['conname']}")
            print(f"    {constraint['definition']}")
        
    except Exception as e:
        print(f"❌ Error checking schema: {e}")
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check_schema())
