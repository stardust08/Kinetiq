"""
Integration test for CategoryService.get_category_by_id() with actual database.

This test verifies that the get_category_by_id() method works correctly
with the seeded database data, meeting the requirements for US-3.2.
"""

import asyncio
from app.db.client import db
from app.api.category.service import CategoryService
from app.core.exceptions import NotFoundException


async def test_get_category_by_id_integration():
    """Test get_category_by_id() with actual database."""
    print("=" * 70)
    print("Testing CategoryService.get_category_by_id()")
    print("=" * 70)
    
    try:
        # Connect to database
        await db.connect()
        print("✓ Connected to database\n")
        
        # First, get all categories to find a valid ID
        print("1. Getting all categories to find a valid ID...")
        all_categories = await CategoryService.get_all_categories()
        
        if len(all_categories) == 0:
            print("⚠ No categories found in database. Cannot test get_category_by_id()")
            return
        
        test_category_id = all_categories[0]['id']
        test_category_name = all_categories[0]['name']
        print(f"   Using category: {test_category_name} (ID: {test_category_id})")
        print(f"   ✓ Found valid category ID\n")
        
        # Test 2: Get category by ID
        print("2. Testing get_category_by_id() with valid ID...")
        category = await CategoryService.get_category_by_id(test_category_id)
        print(f"   Retrieved category: {category.get('name')}")
        
        # Verify structure
        print(f"\n   Category details:")
        print(f"   - ID: {category.get('id')}")
        print(f"   - Name: {category.get('name')}")
        print(f"   - Slug: {category.get('slug')}")
        print(f"   - Status: {category.get('status')}")
        print(f"   - Description: {category.get('description')[:50] if category.get('description') else 'None'}...")
        print(f"   - Image URL: {category.get('imageUrl')}")
        print(f"   - Created At: {category.get('createdAt')}")
        
        # Verify services are included
        services = category.get('services', [])
        print(f"   - Services: {len(services)} services included")
        
        if len(services) > 0:
            print(f"\n   First service:")
            first_service = services[0]
            print(f"   - ID: {first_service.get('id')}")
            print(f"   - Name: {first_service.get('name')}")
            print(f"   - Base Price: ${first_service.get('basePrice')}")
            print(f"   - Payment Type: {first_service.get('paymentType')}")
        
        # Verify required fields exist
        required_fields = ['id', 'name', 'slug', 'status', 'services', 'createdAt']
        for field in required_fields:
            assert field in category, f"Missing required field: {field}"
        
        print(f"\n   ✓ Category structure is correct")
        print(f"   ✓ Services are included in response")
        
        # Test 3: Verify services belong to this category
        print("\n3. Verifying all services belong to this category...")
        for service in services:
            service_category_id = service.get('categoryId')
            assert service_category_id == test_category_id, \
                f"Service {service.get('name')} has categoryId {service_category_id}, expected {test_category_id}"
        
        print(f"   ✓ All {len(services)} services belong to this category")
        
        # Test 4: Test with non-existent ID
        print("\n4. Testing get_category_by_id() with non-existent ID...")
        non_existent_id = "non-existent-category-id-12345"
        
        try:
            await CategoryService.get_category_by_id(non_existent_id)
            print(f"   ✗ FAIL: Should have raised NotFoundException")
            assert False, "Should have raised NotFoundException"
        except NotFoundException as e:
            print(f"   ✓ Correctly raised NotFoundException: {str(e)}")
        
        # Test 5: Verify data consistency with get_all_categories
        print("\n5. Verifying data consistency with get_all_categories()...")
        category_from_list = next(
            (cat for cat in all_categories if cat['id'] == test_category_id),
            None
        )
        
        if category_from_list:
            # Compare basic fields
            assert category['id'] == category_from_list['id'], "ID mismatch"
            assert category['name'] == category_from_list['name'], "Name mismatch"
            assert category['slug'] == category_from_list['slug'], "Slug mismatch"
            assert category['status'] == category_from_list['status'], "Status mismatch"
            
            # Verify service count matches
            service_count_from_list = category_from_list['serviceCount']
            actual_service_count = len(category['services'])
            assert actual_service_count == service_count_from_list, \
                f"Service count mismatch: get_category_by_id has {actual_service_count}, get_all_categories has {service_count_from_list}"
            
            print(f"   ✓ Data is consistent between methods")
            print(f"   ✓ Service count matches: {actual_service_count}")
        
        print("\n" + "=" * 70)
        print("✓ All integration tests passed!")
        print("=" * 70)
        print("\nSummary:")
        print(f"  ✓ Successfully retrieved category by ID")
        print(f"  ✓ Category includes all required fields")
        print(f"  ✓ Services are included in response")
        print(f"  ✓ All services belong to the category")
        print(f"  ✓ NotFoundException raised for invalid ID")
        print(f"  ✓ Data is consistent with get_all_categories()")
        
    except AssertionError as e:
        print(f"\n✗ FAIL: {e}")
        raise
    except Exception as e:
        print(f"\n✗ Error during integration test: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        # Disconnect from database
        await db.disconnect()
        print("\n✓ Disconnected from database")


if __name__ == "__main__":
    asyncio.run(test_get_category_by_id_integration())
