#!/bin/bash

# ✅ CONFIGURE THIS
CONTAINER_NAME="mysql_db"            # name of your MySQL container
VOLUME_NAME="tourism-analytics_mysql_data"  # docker volume name
BACKUP_DIR="$HOME/mysql_backups"     # where to save backup files
DATE_TAG=$(date +%F_%H-%M)
DUMP_FILE="$BACKUP_DIR/mysql_backup_$DATE_TAG.sql"
VOLUME_FILE="$BACKUP_DIR/mysql_volume_backup_$DATE_TAG.tar.gz"
MYSQL_USER="root"
MYSQL_PASSWORD="Asdf1234!"           # replace with your actual password

# ✅ Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "🔄 Backing up MySQL databases from container: $CONTAINER_NAME"
docker exec "$CONTAINER_NAME" \
    mysqldump -u$MYSQL_USER -p$MYSQL_PASSWORD --all-databases > "$DUMP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ SQL dump saved to $DUMP_FILE"
else
    echo "❌ Failed SQL dump"
fi

echo "📦 Backing up Docker volume: $VOLUME_NAME"
docker run --rm \
  -v ${VOLUME_NAME}:/volume \
  -v ${BACKUP_DIR}:/backup \
  alpine \
  tar czvf "/backup/mysql_volume_backup_$DATE_TAG.tar.gz" -C /volume ./

if [ $? -eq 0 ]; then
    echo "✅ Volume backup saved to $VOLUME_FILE"
else
    echo "❌ Failed volume backup"
fi


