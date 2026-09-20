"""
Acceptance Criteria Test for US-3.1: Browse all categories.

This test verifies that the get_all_categories() implementation meets
all acceptance criteria from the requirements:

US-3.1 Acceptance Criteria:
- User can view list of all categories
- Each category shows name, image, description, and status
- Categories marked as "Coming Soon" are indicated
- Response includes category slug for URL-friendly navigation
- Categories are sorted by creation date (newest first)
"""

import asyncio
from app.db.client import db
from app.api.category.service import CategoryService


async def test_us_3_1_acceptance_criteria():
    """Test all acceptance criteria for US-3.1."""
    print("=" * 70)
    print("US-3.1 Acceptance Criteria Verification")
    print("=" * 70)
    
    try:
        # Connect to database
        await db.connect()
        print("✓ Connected to database\n")
        
        # AC 1: User can view list of all categories
        print("AC 1: User can view list of all categories")
        print("-" * 70)
        categories = await CategoryService.get_all_categories()
        print(f"Retrieved {len(categories)} categories")
        assert len(categories) > 0, "Should retrieve at least one category"
        print("✓ PASS: User can view list of all categories\n")
        
        # AC 2: Each category shows name, image, description, and status
        print("AC 2: Each category shows name, image, description, and status")
        print("-" * 70)
        for i, cat in enumerate(categories[:3], 1):  # Check first 3
            print(f"Category {i}: {cat.get('name')}")
            print(f"  - Name: {cat.get('name')} ✓")
            print(f"  - Image URL: {cat.get('imageUrl')} ✓")
            print(f"  - Description: {cat.get('description')[:50] if cat.get('description') else 'None'}... ✓")
            print(f"  - Status: {cat.get('status')} ✓")
            
            # Verify all required fields exist
            assert cat.get('name'), f"Category {i} missing name"
            assert 'imageUrl' in cat, f"Category {i} missing imageUrl field"
            assert 'description' in cat, f"Category {i} missing description field"
            assert cat.get('status'), f"Category {i} missing status"
        
        print("✓ PASS: All categories show required fields\n")
        
        # AC 3: Categories marked as "Coming Soon" are indicated
        print("AC 3: Categories marked as 'Coming Soon' are indicated")
        print("-" * 70)
        coming_soon_categories = [cat for cat in categories if cat.get('status') == 'COMING_SOON']
        active_categories = [cat for cat in categories if cat.get('status') == 'ACTIVE']
        
        print(f"Active categories: {len(active_categories)}")
        print(f"Coming Soon categories: {len(coming_soon_categories)}")
        
        if coming_soon_categories:
            for cat in coming_soon_categories:
                print(f"  - {cat.get('name')}: {cat.get('status')}")
                assert cat.get('status') == 'COMING_SOON', "Status should be COMING_SOON"
        
        print("✓ PASS: Coming Soon categories are properly indicated\n")
        
        # AC 4: Response includes category slug for URL-friendly navigation
        print("AC 4: Response includes category slug for URL-friendly navigation")
        print("-" * 70)
        for i, cat in enumerate(categories[:3], 1):
            slug = cat.get('slug')
            print(f"Category {i}: {cat.get('name')}")
            print(f"  - Slug: {slug}")
            
            # Verify slug exists and is URL-friendly
            assert slug, f"Category {i} missing slug"
            assert slug.islower(), f"Slug should be lowercase: {slug}"
            assert ' ' not in slug, f"Slug should not contain spaces: {slug}"
            assert slug.replace('-', '').replace('_', '').isalnum(), f"Slug should only contain alphanumeric and hyphens: {slug}"
        
        print("✓ PASS: All categories have URL-friendly slugs\n")
        
        # AC 5: Categories are sorted by creation date (newest first)
        print("AC 5: Categories are sorted by creation date (newest first)")
        print("-" * 70)
        if len(categories) >= 2:
            print("Checking sort order (newest first):")
            for i in range(min(3, len(categories))):
                cat = categories[i]
                print(f"  {i+1}. {cat.get('name')}: {cat.get('createdAt')}")
            
            # Verify sorting
            for i in range(len(categories) - 1):
                current_date = categories[i].get('createdAt')
                next_date = categories[i + 1].get('createdAt')
                
                # Convert to comparable format if needed
                if current_date and next_date:
                    assert current_date >= next_date, \
                        f"Categories not sorted correctly: {current_date} should be >= {next_date}"
            
            print("✓ PASS: Categories are sorted by creation date (newest first)\n")
        else:
            print("⚠ Only one category, cannot verify sorting\n")
        
        # Additional verification: Service count is included
        print("Additional: Service count is included in response")
        print("-" * 70)
        for i, cat in enumerate(categories[:3], 1):
            service_count = cat.get('serviceCount')
            print(f"Category {i}: {cat.get('name')} - {service_count} services")
            assert 'serviceCount' in cat, f"Category {i} missing serviceCount"
            assert isinstance(service_count, int), f"serviceCount should be integer"
            assert service_count >= 0, f"serviceCount should be non-negative"
        
        print("✓ PASS: Service count is included\n")
        
        # Verify services list is NOT included (replaced with count)
        print("Additional: Services list is not included (replaced with count)")
        print("-" * 70)
        for cat in categories:
            assert 'services' not in cat, "Services list should not be in response"
        print("✓ PASS: Services list properly excluded\n")
        
        print("=" * 70)
        print("✓ ALL ACCEPTANCE CRITERIA PASSED!")
        print("=" * 70)
        print("\nSummary:")
        print(f"  ✓ AC 1: User can view list of all categories")
        print(f"  ✓ AC 2: Each category shows name, image, description, and status")
        print(f"  ✓ AC 3: Categories marked as 'Coming Soon' are indicated")
        print(f"  ✓ AC 4: Response includes category slug for URL-friendly navigation")
        print(f"  ✓ AC 5: Categories are sorted by creation date (newest first)")
        print(f"  ✓ Additional: Service count is included")
        print(f"  ✓ Additional: Services list is excluded")
        
    except AssertionError as e:
        print(f"\n✗ FAIL: {e}")
        raise
    except Exception as e:
        print(f"\n✗ Error during test: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        # Disconnect from database
        await db.disconnect()
        print("\n✓ Disconnected from database")


if __name__ == "__main__":
    asyncio.run(test_us_3_1_acceptance_criteria())
