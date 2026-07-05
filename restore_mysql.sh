#!/bin/bash

# ✅ CONFIGURATION
CONTAINER_NAME="mysql_db"
VOLUME_NAME="tourism-analytics_mysql_data"
BACKUP_DIR="$HOME/mysql_backups"
# BACKUP_DIR="$HOME/tourism-analytics"
MYSQL_USER="root"
MYSQL_PASSWORD="Asdf1234!"  # Replace with correct password

# 📁 Choose the backup file to restore (you can modify this to restore latest)
SQL_FILE="$BACKUP_DIR/mysql_backup_2026-02-03_04-57.sql"
VOLUME_ARCHIVE="$BACKUP_DIR/mysql_volume_backup_2025-10-31_08-27.tar.gz"

# 🧠 ASK: Restore SQL or Volulme?
echo "What do you want to restore?"
echo "1. SQL dump"
echo "2. Docker volume archive"
read -p "Enter choice [1 or 2]: " choice

if [[ "$choice" == "1" ]]; then
    if [[ ! -f "$SQL_FILE" ]]; then
        echo "❌ SQL file not found: $SQL_FILE"
        exit 1
    fi
    echo "♻️ Restoring SQL dump to container: $CONTAINER_NAME"
    docker exec -i "$CONTAINER_NAME" \
        sh -c "exec mysql -u$MYSQL_USER -p$MYSQL_PASSWORD" < "$SQL_FILE"

    if [[ $? -eq 0 ]]; then
        echo "✅ SQL restore completed."
    else
        echo "❌ SQL restore failed."
    fi

elif [[ "$choice" == "2" ]]; then
    if [[ ! -f "$VOLUME_ARCHIVE" ]]; then
        echo "❌ Volume archive not found: $VOLUME_ARCHIVE"
        exit 1
    fi

    echo "♻️ Restoring Docker volume: $VOLUME_NAME"
    docker run --rm \
      -v ${VOLUME_NAME}:/volume \
      -v ${BACKUP_DIR}:/backup \
      alpine \
      sh -c "rm -rf /volume/* && tar xzvf /backup/$(basename $VOLUME_ARCHIVE) -C /volume"

    if [[ $? -eq 0 ]]; then
        echo "✅ Volume restore completed."
    else
        echo "❌ Volume restore failed."
    fi
else
    echo "❌ Invalid choice. Please enter 1 or 2."
fi

