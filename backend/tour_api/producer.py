from kafka import KafkaProducer
from kafka.errors import KafkaTimeoutError
import json
import time
import sys

BOOTSTRAP_SERVERS = 'kafka_broker:9092'
TOPIC = 'hello'

print("Connecting to Kafka...", flush=True)

try:
    producer = KafkaProducer(
        bootstrap_servers=BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8'),
        request_timeout_ms=5000,
        metadata_max_age_ms=5000
    )

    # Force metadata fetch (connection test)
    producer.bootstrap_connected()
    producer.partitions_for(TOPIC)

    print("Kafka connection OK", flush=True)

except KafkaTimeoutError as e:
    print("Kafka connection FAILED", flush=True)
    print(e, flush=True)
    sys.exit(1)

# Simulate sending 5 events
for i in range(5):
    event = {
        "event_type": "page_view",
        "user_id": f"user_{i}",
        "url": "/home",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

    producer.send(TOPIC, event)
    producer.flush()
    print(f"Sent: {event}", flush=True)
    time.sleep(1)

producer.flush()
print("Done sending events.", flush=True)
