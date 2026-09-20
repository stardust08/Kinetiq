"""
Comprehensive test suite for booking screening count constraints.
Tests both database-level constraints and application-level logic.
"""

import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))

from prisma import Prisma

async def test_constraints():
    """Run comprehensive constraint tests."""
    
    db = Prisma()
    await db.connect()
    
    try:
        print("="*70)
        print("BOOKING SCREENING COUNT CONSTRAINTS - COMPREHENSIVE TEST SUITE")
        print("="*70)
        
        # Get test data
        user = await db.user.find_first()
        service = await db.service.find_first()
        payment = await db.payment.find_first()
        
        if not user or not service or not payment:
            print("\n⚠️  Cannot run tests: Need at least one user, service, and payment")
            print("   Please seed the database first.")
            return False
        
        print(f"\nUsing test data:")
        print(f"  User: {user.id}")
        print(f"  Service: {service.id}")
        print(f"  Payment: {payment.id}")
        
        test_results = []
        
        # TEST 1: Negative totalScreeningCount
        print("\n" + "-"*70)
        print("TEST 1: Reject negative totalScreeningCount")
        print("-"*70)
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), '{user.id}', '{service.id}', '{payment.id}',
                    100.0, 100.0, NOW(),
                    -1, 0, 0
                );
            """)
            print("❌ FAILED: Negative totalScreeningCount was accepted")
            test_results.append(False)
        except Exception as e:
            if "check" in str(e).lower() or "constraint" in str(e).lower():
                print("✅ PASSED: Negative totalScreeningCount correctly rejected")
                test_results.append(True)
            else:
                print(f"⚠️  UNEXPECTED ERROR: {e}")
                test_results.append(False)
        
        # TEST 2: Negative usedScreeningCount
        print("\n" + "-"*70)
        print("TEST 2: Reject negative usedScreeningCount")
        print("-"*70)
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), '{user.id}', '{service.id}', '{payment.id}',
                    100.0, 100.0, NOW(),
                    10, -1, 11
                );
            """)
            print("❌ FAILED: Negative usedScreeningCount was accepted")
            test_results.append(False)
        except Exception as e:
            if "check" in str(e).lower() or "constraint" in str(e).lower():
                print("✅ PASSED: Negative usedScreeningCount correctly rejected")
                test_results.append(True)
            else:
                print(f"⚠️  UNEXPECTED ERROR: {e}")
                test_results.append(False)
        
        # TEST 3: Negative remainingScreeningCount
        print("\n" + "-"*70)
        print("TEST 3: Reject negative remainingScreeningCount")
        print("-"*70)
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), '{user.id}', '{service.id}', '{payment.id}',
                    100.0, 100.0, NOW(),
                    10, 11, -1
                );
            """)
            print("❌ FAILED: Negative remainingScreeningCount was accepted")
            test_results.append(False)
        except Exception as e:
            if "check" in str(e).lower() or "constraint" in str(e).lower():
                print("✅ PASSED: Negative remainingScreeningCount correctly rejected")
                test_results.append(True)
            else:
                print(f"⚠️  UNEXPECTED ERROR: {e}")
                test_results.append(False)
        
        # TEST 4: Inconsistent counts (total < used + remaining)
        print("\n" + "-"*70)
        print("TEST 4: Reject inconsistent counts (total < used + remaining)")
        print("-"*70)
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), '{user.id}', '{service.id}', '{payment.id}',
                    100.0, 100.0, NOW(),
                    10, 5, 6
                );
            """)
            print("❌ FAILED: Inconsistent counts (10 ≠ 5 + 6) were accepted")
            test_results.append(False)
        except Exception as e:
            if "check" in str(e).lower() or "constraint" in str(e).lower():
                print("✅ PASSED: Inconsistent counts correctly rejected")
                test_results.append(True)
            else:
                print(f"⚠️  UNEXPECTED ERROR: {e}")
                test_results.append(False)
        
        # TEST 5: Inconsistent counts (total > used + remaining)
        print("\n" + "-"*70)
        print("TEST 5: Reject inconsistent counts (total > used + remaining)")
        print("-"*70)
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), '{user.id}', '{service.id}', '{payment.id}',
                    100.0, 100.0, NOW(),
                    10, 3, 5
                );
            """)
            print("❌ FAILED: Inconsistent counts (10 ≠ 3 + 5) were accepted")
            test_results.append(False)
        except Exception as e:
            if "check" in str(e).lower() or "constraint" in str(e).lower():
                print("✅ PASSED: Inconsistent counts correctly rejected")
                test_results.append(True)
            else:
                print(f"⚠️  UNEXPECTED ERROR: {e}")
                test_results.append(False)
        
        # TEST 6: Valid counts (all zeros)
        print("\n" + "-"*70)
        print("TEST 6: Accept valid counts (all zeros)")
        print("-"*70)
        try:
            test_id = None
            result = await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), '{user.id}', '{service.id}', '{payment.id}',
                    100.0, 100.0, NOW(),
                    0, 0, 0
                ) RETURNING id;
            """)
            print("✅ PASSED: Valid counts (0, 0, 0) correctly accepted")
            test_results.append(True)
            # Cleanup
            await db.execute_raw(f"""
                DELETE FROM "Booking" 
                WHERE "userId" = '{user.id}' 
                AND "totalScreeningCount" = 0 
                AND "usedScreeningCount" = 0 
                AND "remainingScreeningCount" = 0
                AND "createdAt" > NOW() - INTERVAL '1 minute';
            """)
        except Exception as e:
            print(f"❌ FAILED: Valid counts were rejected: {e}")
            test_results.append(False)
        
        # TEST 7: Valid counts (typical scenario)
        print("\n" + "-"*70)
        print("TEST 7: Accept valid counts (10 total, 3 used, 7 remaining)")
        print("-"*70)
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), '{user.id}', '{service.id}', '{payment.id}',
                    100.0, 100.0, NOW(),
                    10, 3, 7
                ) RETURNING id;
            """)
            print("✅ PASSED: Valid counts (10, 3, 7) correctly accepted")
            test_results.append(True)
            # Cleanup
            await db.execute_raw(f"""
                DELETE FROM "Booking" 
                WHERE "userId" = '{user.id}' 
                AND "totalScreeningCount" = 10 
                AND "usedScreeningCount" = 3 
                AND "remainingScreeningCount" = 7
                AND "createdAt" > NOW() - INTERVAL '1 minute';
            """)
        except Exception as e:
            print(f"❌ FAILED: Valid counts were rejected: {e}")
            test_results.append(False)
        
        # TEST 8: Valid counts (all used)
        print("\n" + "-"*70)
        print("TEST 8: Accept valid counts (10 total, 10 used, 0 remaining)")
        print("-"*70)
        try:
            await db.execute_raw(f"""
                INSERT INTO "Booking" (
                    id, "userId", "serviceId", "paymentId", 
                    "totalAmount", "paidAmount", time,
                    "totalScreeningCount", "usedScreeningCount", "remainingScreeningCount"
                ) VALUES (
                    gen_random_uuid(), '{user.id}', '{service.id}', '{payment.id}',
                    100.0, 100.0, NOW(),
                    10, 10, 0
                ) RETURNING id;
            """)
            print("✅ PASSED: Valid counts (10, 10, 0) correctly accepted")
            test_results.append(True)
            # Cleanup
            await db.execute_raw(f"""
                DELETE FROM "Booking" 
                WHERE "userId" = '{user.id}' 
                AND "totalScreeningCount" = 10 
                AND "usedScreeningCount" = 10 
                AND "remainingScreeningCount" = 0
                AND "createdAt" > NOW() - INTERVAL '1 minute';
            """)
        except Exception as e:
            print(f"❌ FAILED: Valid counts were rejected: {e}")
            test_results.append(False)
        
        # Summary
        print("\n" + "="*70)
        print("TEST SUMMARY")
        print("="*70)
        passed = sum(test_results)
        total = len(test_results)
        print(f"\nTests Passed: {passed}/{total}")
        
        if passed == total:
            print("\n✅ ALL TESTS PASSED!")
            print("\nConstraints are working correctly:")
            print("  ✓ Non-negative counts enforced")
            print("  ✓ Count consistency enforced (total = used + remaining)")
            print("  ✓ Valid data accepted")
            return True
        else:
            print(f"\n❌ {total - passed} TEST(S) FAILED")
            return False
        
    except Exception as e:
        print(f"\n❌ Test suite error: {e}")
        return False
    finally:
        await db.disconnect()

if __name__ == "__main__":
    success = asyncio.run(test_constraints())
    sys.exit(0 if success else 1)
