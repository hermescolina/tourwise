import os
import json
import logging
from typing import Optional, Dict, Any
from app.api.producer import RedpandaProducer # Assuming this helper class is ready
from app.db.setup import get_session
from app.db.models.tours import TourHistoryImage # Assuming this model is imported

# Configure logging
logger = logging.getLogger(__name__)

# Initialize the Kafka Producer instance once
# The environment variable REDPANDA_BROKERS (kafka:29092) is read by the RedpandaProducer class
try:
    producer_instance = RedpandaProducer()
    logger.info("Kafka Producer initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize Kafka Producer: {e}")
    producer_instance = None # Set to None if initialization fails

def update_history_image(image_id: int, image_url: str) -> Optional[Dict[str, Any]]:
    """
    Handles PATCH request to update the URL of a history image,
    and publishes an event to Kafka for the ML processor.
    """
    db_session = next(get_session()) # Get a database session

    try:
        # 1. Update the image record in the database
        image_record = db_session.get(TourHistoryImage, image_id)
        
        if not image_record:
            logger.warning(f"TourHistoryImage with ID {image_id} not found.")
            return None # Or raise HTTPException

        # Update the URL and mark as active
        image_record.image_url = image_url
        image_record.is_active = True
        
        db_session.commit()
        db_session.refresh(image_record)

        # 2. Prepare and Publish the Kafka Event (If Producer is available)
        if producer_instance:
            # Create the data payload for the ML processor
            event_payload = {
                "id": image_record.id,
                "tour_id": image_record.tour_id,
                "city": image_record.city,
                "country": image_record.country,
                "url": image_record.image_url,
                "timestamp": image_record.updated_at.isoformat() 
            }
            
            # Use the Tour ID as the message key to ensure ordered processing by tour
            message_key = str(image_record.tour_id) 
            topic_name = os.environ.get("KAFKA_TOPIC_HISTORY_IMAGES", "tour.history_images.update")

            # Publish the message asynchronously
            producer_instance.publish(
                topic=topic_name,
                key=message_key,
                value=event_payload
            )
            
            logger.info(f"Published update event for History Image {image_id} to topic {topic_name}")
        else:
            logger.warning("Event skipped: Kafka Producer was not initialized.")

        # 3. Return the updated record data
        return {
            "id": image_record.id,
            "tour_id": image_record.tour_id,
            "city": image_record.city,
            "image_url": image_record.image_url,
            "is_active": image_record.is_active
        }

    except Exception as e:
        db_session.rollback()
        logger.error(f"Error updating image ID {image_id}: {e}", exc_info=True)
        # Re-raise or handle error appropriately for Flask
        raise
    finally:
        db_session.close()
