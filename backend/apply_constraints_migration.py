"""
Script to apply database constraints for booking screening counts.
This adds CHECK constraints to ensure data integrity.
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent))

from prisma import Prisma

async def apply_constraints():
    """Apply CHECK constraints to Booking table."""
    
    db = Prisma()
    await db.connect()
    
    try:
        print("Applying database constraints...")
        
        # Constraint 1: Non-negative counts
        print("Adding non-negative counts constraint...")
        await db.execute_raw("""
            ALTER TABLE "Booking" 
            ADD CONSTRAINT "booking_screening_counts_non_negative" 
            CHECK (
              "totalScreeningCount" >= 0 AND 
              "usedScreeningCount" >= 0 AND 
              "remainingScreeningCount" >= 0
            );
        """)
        print("✓ Non-negative counts constraint added")
        
        # Constraint 2: Count consistency
        print("Adding count consistency constraint...")
        await db.execute_raw("""
            ALTER TABLE "Booking" 
            ADD CONSTRAINT "booking_screening_counts_consistency" 
            CHECK ("totalScreeningCount" = "usedScreeningCount" + "remainingScreeningCount");
        """)
        print("✓ Count consistency constraint added")
        
        print("\n✅ All constraints applied successfully!")
        
        # Verify constraints were added
        print("\nVerifying constraints...")
        constraints = await db.query_raw("""
            SELECT conname, pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = '"Booking"'::regclass
            AND conname LIKE 'booking_screening%';
        """)
        
        print("\nApplied constraints:")
        for constraint in constraints:
            print(f"  - {constraint['conname']}")
            print(f"    {constraint['definition']}")
        
    except Exception as e:
        error_msg = str(e)
        if "already exists" in error_msg or "duplicate" in error_msg.lower():
            print(f"⚠️  Constraints already exist: {e}")
            print("Skipping constraint creation.")
        else:
            print(f"❌ Error applying constraints: {e}")
            raise
    finally:
        await db.disconnect()

async def test_constraints():
    """Test that constraints are working correctly."""
    
    db = Prisma()
    await db.connect()
    
    try:
        print("\n" + "="*60)
        print("Testing constraints...")
        print("="*60)
        
        # Get a sample user, service, and payment for testing
        user = await db.user.find_first()
        service = await db.service.find_first()
        payment = await db.payment.find_first()
        
        if not user or not service or not payment:
            print("⚠️  Skipping tests: No test data available (need at least one user, service, and payment)")
            return
        
        # Test 1: Try to insert negative counts (should fail)
        print("\nTest 1: Attempting to insert negative counts (should fail)...")
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), 
                    '{user.id}',
                    '{service.id}',
                    '{payment.id}',
                    100.0, 100.0, NOW(),
                    -1, 0, 0
                );
            """)
            print("❌ Test 1 FAILED: Negative count was allowed!")
        except Exception as e:
            if "check constraint" in str(e).lower() or "violates" in str(e).lower():
                print("✓ Test 1 PASSED: Negative counts correctly rejected")
            else:
                print(f"⚠️  Test 1: Unexpected error: {e}")
        
        # Test 2: Try to insert inconsistent counts (should fail)
        print("\nTest 2: Attempting to insert inconsistent counts (should fail)...")
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), 
                    '{user.id}',
                    '{service.id}',
                    '{payment.id}',
                    100.0, 100.0, NOW(),
                    10, 3, 5
                );
            """)
            print("❌ Test 2 FAILED: Inconsistent counts were allowed!")
        except Exception as e:
            if "check constraint" in str(e).lower() or "violates" in str(e).lower():
                print("✓ Test 2 PASSED: Inconsistent counts correctly rejected")
            else:
                print(f"⚠️  Test 2: Unexpected error: {e}")
        
        # Test 3: Try to insert valid counts (should succeed)
        print("\nTest 3: Attempting to insert valid counts (should succeed)...")
        try:
            result = await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), 
                    '{user.id}',
                    '{service.id}',
                    '{payment.id}',
                    100.0, 100.0, NOW(),
                    10, 3, 7
                ) RETURNING id;
            """)
            print("✓ Test 3 PASSED: Valid counts correctly accepted")
            
            # Clean up test booking - find and delete the most recent booking
            await db.execute_raw(f"""
                DELETE FROM "Booking" 
                WHERE "userId" = '{user.id}' 
                AND "totalScreeningCount" = 10 
                AND "usedScreeningCount" = 3 
                AND "remainingScreeningCount" = 7
                AND "createdAt" > NOW() - INTERVAL '1 minute';
            """)
            print("  (Test booking cleaned up)")
            
        except Exception as e:
            print(f"❌ Test 3 FAILED: Valid counts were rejected! {e}")
        
        print("\n" + "="*60)
        print("✅ All constraint tests completed!")
        print("="*60)
        
    except Exception as e:
        print(f"❌ Error during testing: {e}")
    finally:
        await db.disconnect()

async def main():
    """Main function to apply and test constraints."""
    try:
        await apply_constraints()
        await test_constraints()
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        exit(1)

if __name__ == "__main__":
    asyncio.run(main())
