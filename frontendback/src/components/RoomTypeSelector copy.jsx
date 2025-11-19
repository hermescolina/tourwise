import { useState } from "react";
import "./RoomTypeSelector.css"; // optional CSS file

export default function RoomTypeSelector({ value, onChange }) {
  const [roomType, setRoomType] = useState(value || "Standard");

  const handleChange = (e) => {
    setRoomType(e.target.value);
    if (onChange) onChange(e.target.value); // pass value back to parent
  };

  return (
    <div>
      <label className="filterLabel">Room Type: </label>
      <select
        value={roomType}
        onChange={handleChange}
        className="roomTypeDropdown"
      >
        <option value="Standard">Standard</option>
        <option value="Deluxe">Deluxe</option>
        <option value="Suite">Suite</option>
      </select>
    </div>
  );
}
