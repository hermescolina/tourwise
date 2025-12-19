# from kafka import KafkaConsumer
# from pymongo import MongoClient

# # Kafka
# consumer = KafkaConsumer(
#     'hello',
#     bootstrap_servers='kafka_broker:9092',
#     value_deserializer=lambda m: m.decode('utf-8'),
#     auto_offset_reset='earliest'
# )
# print("Kafka connection OK")

# # Mongo
# client = MongoClient('mongodb://mongo:27017/')
# db = client['ml_data']
# print("MongoDB connection OK")


# from kafka import KafkaConsumer

# consumer = KafkaConsumer(
#     'hello',
#     bootstrap_servers='kafka_broker:9092',
#     auto_offset_reset='earliest',
#     enable_auto_commit=True,
#     group_id='test_group'
# )

# print("Kafka connection OK, waiting for messages...")

# for msg in consumer:
#     print("RAW MESSAGE:", msg.value)


import json
from kafka import KafkaConsumer
from pymongo import MongoClient

mongo_client = MongoClient('mongodb://mongo:27017/')
db = mongo_client['ml_data']
collection = db['events']


consumer = KafkaConsumer(
    'hello',
    bootstrap_servers='kafka_broker:9092',
    auto_offset_reset='earliest',
    enable_auto_commit=True,
    group_id='test_group',
    value_deserializer=lambda m: json.loads(m.decode('utf-8'))
)

print("Kafka connection OK, waiting for messages...")

for msg in consumer:
    event = msg.value
    print("Decoded message:", event)
    collection.insert_one(event)  # persists the event
    # print("Decoded message:", msg.value)
