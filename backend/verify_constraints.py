"""
Script to verify that database constraints are properly applied.
"""

import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from prisma import Prisma

async def verify_constraints():
    """Verify that CHECK constraints are applied to Booking table."""
    
    db = Prisma()
    await db.connect()
    
    try:
        print("="*60)
        print("Verifying Database Constraints")
        print("="*60)
        
        # Get all constraints on Booking table
        constraints = await db.query_raw("""
            SELECT 
                conname as constraint_name,
                contype as constraint_type,
                pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = '"Booking"'::regclass
            ORDER BY conname;
        """)
        
        print("\nAll constraints on Booking table:")
        print("-" * 60)
        
        check_constraints = []
        for constraint in constraints:
            constraint_type_map = {
                'p': 'PRIMARY KEY',
                'f': 'FOREIGN KEY',
                'c': 'CHECK',
                'u': 'UNIQUE'
            }
            type_name = constraint_type_map.get(constraint['constraint_type'], 'UNKNOWN')
            print(f"\n{constraint['constraint_name']} ({type_name})")
            print(f"  {constraint['definition']}")
            
            if constraint['constraint_type'] == 'c':
                check_constraints.append(constraint)
        
        # Verify specific screening count constraints
        print("\n" + "="*60)
        print("Screening Count Constraints Verification")
        print("="*60)
        
        required_constraints = {
            'booking_screening_counts_non_negative': False,
            'booking_screening_counts_consistency': False
        }
        
        for constraint in check_constraints:
            if constraint['constraint_name'] in required_constraints:
                required_constraints[constraint['constraint_name']] = True
        
        all_present = True
        for name, present in required_constraints.items():
            status = "✓" if present else "✗"
            print(f"{status} {name}: {'PRESENT' if present else 'MISSING'}")
            if not present:
                all_present = False
        
        print("\n" + "="*60)
        if all_present:
            print("✅ All required constraints are properly applied!")
            print("="*60)
            print("\nConstraint Details:")
            print("1. Non-negative counts: Ensures all count fields >= 0")
            print("2. Count consistency: Ensures total = used + remaining")
            return True
        else:
            print("❌ Some required constraints are missing!")
            print("="*60)
            return False
        
    except Exception as e:
        print(f"\n❌ Error verifying constraints: {e}")
        return False
    finally:
        await db.disconnect()

if __name__ == "__main__":
    success = asyncio.run(verify_constraints())
    sys.exit(0 if success else 1)
