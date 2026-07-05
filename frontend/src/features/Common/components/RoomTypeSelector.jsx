import { useState, useEffect } from "react";
import "./CSS/RoomTypeSelector.css";

export default function RoomTypeSelector({ hotelId, value, onChange }) {
  const [roomType, setRoomType] = useState(value || "");
  const [roomTypes, setRoomTypes] = useState([]);

  // fetch rooms for a given hotel
  useEffect(() => {
    async function fetchRooms() {
      try {
        const res = await fetch(`http://localhost:3001/api/hr/rooms/${hotelId}`);
        const data = await res.json();
        if (data.rooms) {
          setRoomTypes(data.rooms);
          // if no initial value, pick the first room type
          if (!value && data.rooms.length > 0) {
            setRoomType(data.rooms[0].room_type);
            if (onChange) onChange(data.rooms[0].room_type);
          }
        }
      } catch (err) {
        console.error("Error fetching rooms:", err);
      }
    }
    if (hotelId) fetchRooms();
  }, [hotelId, value, onChange]);

  const handleChange = (e) => {
    setRoomType(e.target.value);
    if (onChange) onChange(e.target.value);
  };

  return (
    <div>
      <label className="filterLabel">Room Type: </label>
      <select
        value={roomType}
        onChange={handleChange}
        className="roomTypeDropdown"
      >
        {roomTypes.map((room) => (
          <option key={room.room_id} value={room.room_type}>
            {room.room_type}
          </option>
        ))}
      </select>
    </div>
  );
}
