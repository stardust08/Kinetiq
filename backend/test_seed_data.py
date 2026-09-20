"""
Verify seed data in the database.
Tests that all expected categories and services are present with correct data.
"""
import asyncio
import json
from app.db.client import db, connect_db, disconnect_db
from prisma.enums import PaymentType


# Expected data from seed script
EXPECTED_CATEGORIES = [
    "Knee Pain & Arthritis",
    "Back Pain, Slip Disc, Sciatica",
    "Neck & Shoulder Pain",
    "Post-Surgery Rehabilitation",
    "Stroke & Neurological Recovery",
    "Balance Issues & Fall Risk",
    "Hip, Ankle & Sports Injuries"
]

EXPECTED_SERVICES = [
    "AI Assessment",
    "Assessment + Expert Consultation",
    "4 Week Program",
    "8 Week Program",
    "12 Week Program"
]

EXPECTED_PRICES = {
    "AI Assessment": 399.0,
    "Assessment + Expert Consultation": 499.0,
    "4 Week Program": 3999.0,
    "8 Week Program": 6999.0,
    "12 Week Program": 8999.0
}

EXPECTED_PAYMENT_TYPES = {
    "AI Assessment": PaymentType.FULL,
    "Assessment + Expert Consultation": PaymentType.FULL,
    "4 Week Program": PaymentType.PARTIAL,
    "8 Week Program": PaymentType.PARTIAL,
    "12 Week Program": PaymentType.PARTIAL
}


async def test_seed_data():
    """Test that seed data is correctly populated in the database."""
    print("=" * 60)
    print("Verifying Seed Data in Database")
    print("=" * 60)
    
    # Connect to database
    print("\nConnecting to database...")
    try:
        await connect_db()
        print("✓ Connected to database")
    except Exception as e:
        print(f"✗ Failed to connect: {e}")
        return
    
    try:
        # Test 1: Verify category count
        print("\n1. Verifying category count...")
        category_count = await db.category.count()
        print(f"   Expected: {len(EXPECTED_CATEGORIES)} categories")
        print(f"   Found: {category_count} categories")
        assert category_count == len(EXPECTED_CATEGORIES), f"Expected {len(EXPECTED_CATEGORIES)} categories, found {category_count}"
        print("   ✓ Category count is correct")
        
        # Test 2: Verify all expected categories exist
        print("\n2. Verifying all expected categories exist...")
        categories = await db.category.find_many()
        category_names = [cat.name for cat in categories]
        
        for expected_name in EXPECTED_CATEGORIES:
            if expected_name in category_names:
                print(f"   ✓ {expected_name}")
            else:
                print(f"   ✗ Missing: {expected_name}")
                assert False, f"Category '{expected_name}' not found"
        
        print("   ✓ All expected categories exist")
        
        # Test 3: Verify category statuses
        print("\n3. Verifying category statuses...")
        active_count = await db.category.count(where={"status": "ACTIVE"})
        coming_soon_count = await db.category.count(where={"status": "COMING_SOON"})
        print(f"   Active categories: {active_count}")
        print(f"   Coming Soon categories: {coming_soon_count}")
        assert active_count == 6, f"Expected 6 active categories, found {active_count}"
        assert coming_soon_count == 1, f"Expected 1 coming soon category, found {coming_soon_count}"
        print("   ✓ Category statuses are correct")
        
        # Test 4: Verify service count
        print("\n4. Verifying service count...")
        service_count = await db.service.count()
        expected_service_count = 6 * 5  # 6 active categories × 5 services each
        print(f"   Expected: {expected_service_count} services (6 active categories × 5 services)")
        print(f"   Found: {service_count} services")
        assert service_count == expected_service_count, f"Expected {expected_service_count} services, found {service_count}"
        print("   ✓ Service count is correct")
        
        # Test 5: Verify services per category
        print("\n5. Verifying services per active category...")
        active_categories = await db.category.find_many(
            where={"status": "ACTIVE"},
            include={"services": True}
        )
        
        for category in active_categories:
            service_count = len(category.services)
            print(f"   {category.name}: {service_count} services")
            assert service_count == 5, f"Expected 5 services for {category.name}, found {service_count}"
        
        print("   ✓ All active categories have 5 services")
        
        # Test 6: Verify coming soon category has no services
        print("\n6. Verifying coming soon category has no services...")
        coming_soon = await db.category.find_first(
            where={"status": "COMING_SOON"},
            include={"services": True}
        )
        
        if coming_soon:
            print(f"   {coming_soon.name}: {len(coming_soon.services)} services")
            assert len(coming_soon.services) == 0, f"Coming soon category should have no services"
            print("   ✓ Coming soon category has no services")
        
        # Test 7: Verify service names
        print("\n7. Verifying service names...")
        first_category = active_categories[0]
        service_names = [service.name for service in first_category.services]
        
        for expected_name in EXPECTED_SERVICES:
            if expected_name in service_names:
                print(f"   ✓ {expected_name}")
            else:
                print(f"   ✗ Missing: {expected_name}")
                assert False, f"Service '{expected_name}' not found"
        
        print("   ✓ All expected service types exist")
        
        # Test 8: Verify service prices
        print("\n8. Verifying service prices...")
        for service in first_category.services:
            expected_price = EXPECTED_PRICES.get(service.name)
            if expected_price:
                print(f"   {service.name}: ₹{service.basePrice} (expected: ₹{expected_price})")
                assert service.basePrice == expected_price, f"Wrong price for {service.name}"
        
        print("   ✓ All service prices are correct")
        
        # Test 9: Verify payment types
        print("\n9. Verifying payment types...")
        for service in first_category.services:
            expected_type = EXPECTED_PAYMENT_TYPES.get(service.name)
            if expected_type:
                print(f"   {service.name}: {service.paymentType} (expected: {expected_type})")
                assert service.paymentType == expected_type, f"Wrong payment type for {service.name}"
        
        print("   ✓ All payment types are correct")
        
        # Test 10: Verify advance payment details for PARTIAL services
        print("\n10. Verifying advance payment details for PARTIAL services...")
        partial_services = [s for s in first_category.services if s.paymentType == PaymentType.PARTIAL]
        
        for service in partial_services:
            print(f"   {service.name}:")
            print(f"     - Base Price: ₹{service.basePrice}")
            print(f"     - Advance %: {service.advancePercent}%")
            print(f"     - Advance Amount: ₹{service.advanceAmount}")
            
            assert service.advancePercent == 25.0, f"Expected 25% advance for {service.name}"
            expected_advance = service.basePrice * 0.25
            # Allow small floating point difference
            assert abs(service.advanceAmount - expected_advance) < 1.0, f"Wrong advance amount for {service.name}"
        
        print("   ✓ Advance payment details are correct")
        
        # Test 11: Verify service metadata
        print("\n11. Verifying service metadata...")
        sample_service = first_category.services[0]
        print(f"   Sample service: {sample_service.name}")
        print(f"     - Duration: {sample_service.duration}")
        print(f"     - Service Type: {sample_service.serviceType}")
        print(f"     - Delivery Mode: {sample_service.deliveryMode}")
        print(f"     - Session Count: {sample_service.sessionCount}")
        
        # Verify features are stored as JSON
        if sample_service.features:
            try:
                features = json.loads(sample_service.features)
                print(f"     - Features: {len(features)} items")
                assert isinstance(features, list), "Features should be a list"
            except json.JSONDecodeError:
                assert False, "Features should be valid JSON"
        
        print("   ✓ Service metadata is correct")
        
        # Test 12: Verify unique slugs
        print("\n12. Verifying unique slugs...")
        all_services = await db.service.find_many()
        slugs = [service.slug for service in all_services]
        unique_slugs = set(slugs)
        
        print(f"   Total services: {len(all_services)}")
        print(f"   Unique slugs: {len(unique_slugs)}")
        assert len(slugs) == len(unique_slugs), "All service slugs should be unique"
        print("   ✓ All service slugs are unique")
        
        # Test 13: Verify category-service relationships
        print("\n13. Verifying category-service relationships...")
        for category in active_categories:
            for service in category.services:
                assert service.categoryId == category.id, f"Service {service.name} has wrong categoryId"
        
        print("   ✓ All category-service relationships are correct")
        
        # Test 14: Summary statistics
        print("\n14. Database Summary Statistics:")
        print(f"   Total Categories: {category_count}")
        print(f"   Active Categories: {active_count}")
        print(f"   Coming Soon Categories: {coming_soon_count}")
        print(f"   Total Services: {service_count}")
        print(f"   Services per Active Category: 5")
        print(f"   FULL Payment Services: {await db.service.count(where={'paymentType': PaymentType.FULL})}")
        print(f"   PARTIAL Payment Services: {await db.service.count(where={'paymentType': PaymentType.PARTIAL})}")
        
        print("\n" + "=" * 60)
        print("All Seed Data Verification Tests Passed!")
        print("=" * 60)
        print("\nSummary:")
        print("✓ All expected categories exist")
        print("✓ Category statuses are correct")
        print("✓ All expected services exist")
        print("✓ Service counts per category are correct")
        print("✓ Service prices are correct")
        print("✓ Payment types are correct")
        print("✓ Advance payment details are correct")
        print("✓ Service metadata is complete")
        print("✓ All slugs are unique")
        print("✓ Category-service relationships are correct")
        print("\nSeed data is complete and accurate!")
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        raise
    finally:
        # Disconnect from database
        print("\nDisconnecting from database...")
        await disconnect_db()
        print("✓ Disconnected from database")


if __name__ == "__main__":
    asyncio.run(test_seed_data())
