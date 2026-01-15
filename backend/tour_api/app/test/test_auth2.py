import json # Add this import
from auth import create_token, SHARED_KEY
from pyseto import decode

test_user_id = 99
token = create_token(test_user_id)
print(f"Generated Token: {token}")

try:
    decoded = decode(SHARED_KEY, token)
    
    # FIX: Convert bytes to a dictionary
    payload_dict = json.loads(decoded.payload) 
    
    print(f"Decoded Data: {payload_dict}")
    assert payload_dict['user_id'] == test_user_id
    print("✅ Logic Test Passed!")
except Exception as e:
    print(f"❌ Logic Test Failed: {e}")
