# backend/tour_api/test_kafka_conn.py

import os
import json
import socket
from confluent_kafka import Producer, KafkaException
from dotenv import load_dotenv

# --- 1. Load Environment Variables ---
# Assumes your .env.tours file is in the same directory (backend/tour_api)
load_dotenv(os.path.join(os.path.dirname(__file__), '.env.tours'))

# The Kafka broker address from the Docker Compose file: localhost:9092
# If REDPANDA_BROKERS is not set in .env.tours, this is the default
BROKERS = os.environ.get("REDPANDA_BROKERS", "localhost:9092")

# --- 2. Callback Function for Delivery ---
def delivery_report(err, msg):
    """Called once for each message produced to indicate delivery result."""
    if err is not None:
        print(f"\nFATAL ERROR: Delivery failed: {err}")
    else:
        print(f"\nSUCCESS: Message delivered to {msg.topic()} [{msg.partition()}]")

# --- 3. Test Function ---
def run_simple_producer_test():
    """Initializes a producer and attempts to send one message."""
    print(f"--- STARTING KAFKA CONNECTION TEST to {BROKERS} ---")
    
    # Producer Configuration
    conf = {
        'bootstrap.servers': BROKERS,
        'client.id': socket.gethostname(),
        'retries': 3 # Retry failed sends
    }

    try:
        # Initialize the Producer
        producer = Producer(conf)
        print("Producer initialized successfully.")

        # Message details
        topic_name = "test.connectivity.simple"
        test_key = "test-key"
        test_value = {"status": "connection_check", "timestamp": os.path.getmtime(__file__)}
        
        # Produce the message asynchronously
        producer.produce(
            topic_name, 
            key=test_key.encode('utf-8'),
            value=json.dumps(test_value).encode('utf-8'), 
            callback=delivery_report
        )
        
        print(f"Test message SENT to local buffer for topic: {topic_name}")
        
        # CRITICAL: Force the local buffer to empty and wait for the message to be delivered
        print("Flushing producer buffer (waiting for delivery report)...")
        flush_result = producer.flush(timeout=5.0)
        
        if flush_result == 0:
            print("INFO: All messages delivered successfully.")
        else:
             print(f"WARNING: {flush_result} message(s) failed to deliver after flush timeout.")

    except KafkaException as e:
        print(f"\nKAFKA ERROR: Could not connect or send message. Check broker status: {e}")
        print("Ensure Docker Kafka container is running and port 9092 is exposed.")
    except Exception as e:
        print(f"\nGENERIC ERROR: {e}")
    
    print("\n--- KAFKA CONNECTION TEST ENDED ---")


if __name__ == '__main__':
    run_simple_producer_test()