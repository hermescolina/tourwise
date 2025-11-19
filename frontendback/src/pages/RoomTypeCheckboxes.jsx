import { useEffect, useState } from "react";

export default function RoomTypeCheckboxes({
  hotelId,                  // which hotel to fetch from
  value = [],               // selected values
  onChange,                 // callback (newSelectedArray)
  apiBase = "http://localhost:3001/api/hr/rooms" // API base (override if needed)
}) {
  const [rooms, setRooms] = useState([]);

  // Fetch rooms by hotelId
  useEffect(() => {
    if (!hotelId) return;
    fetch(`${apiBase}/${hotelId}`)
      .then((res) => res.json())
      .then((data) => setRooms(data.rooms || []))
      .catch((err) => console.error("Error fetching rooms:", err));
  }, [hotelId, apiBase]);

  // Toggle selection
  const toggle = (roomType) => {
    let newValue;
    if (value.includes(roomType)) {
      newValue = value.filter((t) => t !== roomType);
    } else {
      newValue = [...value, roomType];
    }
    if (onChange) onChange(newValue);
  };

  return (
    <div>
      <h3>Room Types</h3>
      {rooms.map((room) => (
        <label key={room.room_id} style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={value.includes(room.room_type)}
            onChange={() => toggle(room.room_type)}
          />
          {room.room_type} ({room.occupancy} guests, {room.size_sqm} sqm)
        </label>
      ))}
    </div>
  );
}
