
curl https://api.xendit.co/v2/invoices \
  -u "xnd_development_wJIBcO0KyUGCFoVZ0I6daD6VOb3KHeqZq3geFtqOu6yjp3pqddPCG9OZfH:" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "booking_abc_001",
    "amount": 2200,
    "currency": "PHP",
    "description": "TourWise – Island Hopping (Sept 12)",
    "success_redirect_url": "https://app.tourwise.shop/booking/success?ref=booking_abc_001",
    "failure_redirect_url": "https://app.tourwise.shop/booking/failed?ref=booking_abc_001",
    "payment_methods": ["GCASH","GRABPAY","CARD","BPI","BDO"],
    "items": [
      {"name": "Island Hopping", "quantity": 2, "price": 1100}
    ],
    "customer": {
      "given_names": "Hermes",
      "email": "hermes@example.com",
      "mobile_number": "+639171234567"
    }
  }'


curl -X POST "http://localhost:3001/api/xen/xendit/webhook" \
  -H "Content-Type: application/json" \
  -H "x-callback-token: 665c7a17512a6c128c515000b34a24c4426bf28f3e97963057e1c5995de3a498" \
  -d '{
        "event": "invoice.paid",
        "id": "inv_test_123",
        "external_id": "booking_abc_001",
        "status": "PAID",
        "amount": 2200
      }'



python3 - <<'PY'
import os
from dotenv import load_dotenv

# explicitly load the .env.tours file
env_file = "backend/tour_api/.env.tours"
load_dotenv(dotenv_path=env_file)

t = os.getenv("XENDIT_CALLBACK_TOKEN")
print("len:", len(t) if t else 0, "endswith:", (t or "")[-6:])
PY



curl -X POST "http://localhost:3001/api/xen/xendit/webhook" \
  -H "Content-Type: application/json" \
  -H "x-callback-token: 665c7a17512a6c128c515000b34a24c4426bf28f3e97963057e1c5995de3a498" \
  -d '{"event":"invoice.paid","id":"inv_test_123","external_id":"booking_abc_001","status":"PAID","amount":2200}'
