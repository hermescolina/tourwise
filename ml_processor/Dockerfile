FROM python:3.10-slim

WORKDIR /app

# Copy consumer code and requirements
COPY ml_consumer.py requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Run the consumer
CMD ["python3", "-u", "ml_consumer.py"]
