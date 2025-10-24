import { useEffect, useState } from "react";

export default function RoomTypeCheckboxes() {
  const [rooms, setRooms] = useState([]);
  const [selected, setSelected] = useState([]);

  // Fetch rooms from your API
  useEffect(() => {
    fetch("http://localhost:3001/api/hr/rooms/1")
      .then((res) => res.json())
      .then((data) => {
        setRooms(data.rooms || []);
      })
      .catch((err) => console.error("Error fetching rooms:", err));
  }, []);

  // Toggle selection
  const toggleCheckbox = (roomType) => {
    setSelected((prev) =>
      prev.includes(roomType)
        ? prev.filter((t) => t !== roomType) // remove if already selected
        : [...prev, roomType]                // add if not selected
    );
  };

  return (
    <div>
      <h3>Select Room Types</h3>
      {rooms.map((room) => (
        <label key={room.room_id} style={{ display: "block" }}>
          <input
            type="checkbox"
            checked={selected.includes(room.room_type)}
            onChange={() => toggleCheckbox(room.room_type)}
          />
          {room.room_type} ({room.occupancy} guests, {room.size_sqm} sqm)
        </label>
      ))}

      <p>Selected: {selected.length > 0 ? selected.join(", ") : "None"}</p>
    </div>
  );
}
