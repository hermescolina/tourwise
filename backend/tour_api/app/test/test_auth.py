from auth import create_token, SHARED_KEY
from pyseto import decode

# 1. Create a token for a fake user
test_user_id = 99
token = create_token(test_user_id)
print(f"Generated Token: {token}")

# 2. Try to decode it manually
try:
    decoded = decode(SHARED_KEY, token)
    print(f"Decoded Data: {decoded.payload}")
    assert decoded.payload['user_id'] == test_user_id
    print("✅ Logic Test Passed!")
except Exception as e:
    print(f"❌ Logic Test Failed: {e}")
