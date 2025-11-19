#!/bin/bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="excluded_backup_$TIMESTAMP.tar.gz"

tar -czvf $BACKUP_NAME \
  --exclude='./node_modules' \
  --exclude='./frontend/dist' \
  $(find . -type f \( -name "*.yml" -o -name "*.sql" -o -name "*.sh" -o -name "*.txt" -o -name ".env" -o -name ".env*" -o -name "docker-compose.yml" \))

# Optional: Upload to Google Drive (rclone or gdrive)
gdrive upload $BACKUP_NAME

