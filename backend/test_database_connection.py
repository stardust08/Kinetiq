"""
Test database connection and verify it's working correctly.
Tests connection, disconnection, and basic database operations.
"""
import asyncio
from app.db.client import db, connect_db, disconnect_db


async def test_database_connection():
    """Test database connection and basic operations."""
    print("=" * 60)
    print("Testing Database Connection")
    print("=" * 60)
    
    # Test 1: Connect to database
    print("\n1. Testing database connection...")
    try:
        await connect_db()
        print("   ✓ Successfully connected to database")
    except Exception as e:
        print(f"   ✗ Failed to connect: {e}")
        return
    
    # Test 2: Verify connection is active
    print("\n2. Verifying connection is active...")
    try:
        assert db.is_connected(), "Database should be connected"
        print("   ✓ Database connection is active")
    except Exception as e:
        print(f"   ✗ Connection verification failed: {e}")
        await disconnect_db()
        return
    
    # Test 3: Test basic query - count categories
    print("\n3. Testing basic query (count categories)...")
    try:
        count = await db.category.count()
        print(f"   Categories in database: {count}")
        print("   ✓ Basic query executed successfully")
    except Exception as e:
        print(f"   ✗ Query failed: {e}")
        await disconnect_db()
        return
    
    # Test 4: Test basic query - count services
    print("\n4. Testing basic query (count services)...")
    try:
        count = await db.service.count()
        print(f"   Services in database: {count}")
        print("   ✓ Basic query executed successfully")
    except Exception as e:
        print(f"   ✗ Query failed: {e}")
        await disconnect_db()
        return
    
    # Test 5: Test query with filter
    print("\n5. Testing query with filter (active categories)...")
    try:
        active_categories = await db.category.find_many(
            where={"status": "ACTIVE"}
        )
        print(f"   Active categories: {len(active_categories)}")
        if active_categories:
            print(f"   Sample category: {active_categories[0].name}")
        print("   ✓ Filtered query executed successfully")
    except Exception as e:
        print(f"   ✗ Query failed: {e}")
        await disconnect_db()
        return
    
    # Test 6: Test query with relations
    print("\n6. Testing query with relations (category with services)...")
    try:
        category_with_services = await db.category.find_first(
            where={"status": "ACTIVE"},
            include={"services": True}
        )
        if category_with_services:
            print(f"   Category: {category_with_services.name}")
            print(f"   Services count: {len(category_with_services.services)}")
            if category_with_services.services:
                print(f"   Sample service: {category_with_services.services[0].name}")
        print("   ✓ Relational query executed successfully")
    except Exception as e:
        print(f"   ✗ Query failed: {e}")
        await disconnect_db()
        return
    
    # Test 7: Test transaction support
    print("\n7. Testing transaction support...")
    try:
        # Just verify we can start a transaction (don't actually modify data)
        # This tests that the database supports transactions
        async with db.tx() as transaction:
            # Query within transaction
            count = await transaction.category.count()
            print(f"   Transaction query result: {count} categories")
        print("   ✓ Transaction support verified")
    except Exception as e:
        print(f"   ✗ Transaction test failed: {e}")
        await disconnect_db()
        return
    
    # Test 8: Disconnect from database
    print("\n8. Testing database disconnection...")
    try:
        await disconnect_db()
        print("   ✓ Successfully disconnected from database")
    except Exception as e:
        print(f"   ✗ Failed to disconnect: {e}")
        return
    
    # Test 9: Verify connection is closed
    print("\n9. Verifying connection is closed...")
    try:
        assert not db.is_connected(), "Database should be disconnected"
        print("   ✓ Database connection is closed")
    except Exception as e:
        print(f"   ✗ Connection verification failed: {e}")
        return
    
    # Test 10: Test reconnection
    print("\n10. Testing reconnection...")
    try:
        await connect_db()
        assert db.is_connected(), "Database should be connected"
        print("   ✓ Successfully reconnected to database")
        
        # Clean up
        await disconnect_db()
    except Exception as e:
        print(f"   ✗ Reconnection failed: {e}")
        return
    
    print("\n" + "=" * 60)
    print("All Database Connection Tests Passed!")
    print("=" * 60)
    print("\nSummary:")
    print("✓ Database connection established successfully")
    print("✓ Connection state can be verified")
    print("✓ Basic queries work correctly")
    print("✓ Filtered queries work correctly")
    print("✓ Relational queries work correctly")
    print("✓ Transaction support is available")
    print("✓ Database disconnection works correctly")
    print("✓ Connection state after disconnect is correct")
    print("✓ Reconnection works correctly")
    print("\nDatabase is properly configured and operational!")


if __name__ == "__main__":
    asyncio.run(test_database_connection())
