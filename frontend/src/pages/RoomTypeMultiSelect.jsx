import { useEffect, useRef, useState } from "react";
import "./RoomTypeMultiSelect.css";

const DEFAULT_ROOM_TYPES = [
  "Standard", "Deluxe", "Suite", "Family", "Twin",
  "Queen", "King", "Studio", "Apartment"
];

export default function RoomTypeMultiSelect({
  label = "Room Types",
  options = DEFAULT_ROOM_TYPES,
  value = [],                // array of selected strings
  onChange,                  // (newArray) => void
  placeholder = "Select room types..."
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef(null);

  // close on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  const toggle = (opt) => {
    const exists = value.includes(opt);
    const next = exists ? value.filter((v) => v !== opt) : [...value, opt];
    onChange?.(next);
  };

  const visible = options.filter((o) =>
    o.toLowerCase().includes(filter.trim().toLowerCase())
  );

  const allVisibleSelected = visible.length > 0 && visible.every((o) => value.includes(o));

  return (
    <div className="rtms-container" ref={ref}>
      {label && <label className="rtms-label">{label}</label>}

      <button
        type="button"
        className="rtms-control"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
      >
        {value.length === 0 ? (
          <span className="rtms-placeholder">{placeholder}</span>
        ) : (
          <div className="rtms-tags">
            {value.map((v) => (
              <span key={v} className="rtms-tag" onClick={(e)=>{e.stopPropagation(); toggle(v);}}>
                {v} ✕
              </span>
            ))}
          </div>
        )}
        <span className="rtms-caret">▾</span>
      </button>

      {open && (
        <div className="rtms-menu" role="listbox">
          <div className="rtms-toolbar">
            <input
              className="rtms-search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search…"
            />
            <div className="rtms-actions">
              <button
                type="button"
                className="rtms-small"
                onClick={() => onChange?.([...new Set([...value, ...visible])])}
                disabled={visible.length === 0 || allVisibleSelected}
                title="Select all visible"
              >
                Select all
              </button>
              <button
                type="button"
                className="rtms-small"
                onClick={() => onChange?.(value.filter((v) => !visible.includes(v)))}
                disabled={visible.length === 0 || visible.every((o) => !value.includes(o))}
                title="Clear visible"
              >
                Clear
              </button>
            </div>
          </div>

          <ul className="rtms-list">
            {visible.length === 0 && (
              <li className="rtms-empty">No results</li>
            )}
            {visible.map((opt) => (
              <li key={opt}>
                <label className="rtms-item">
                  <input
                    type="checkbox"
                    checked={value.includes(opt)}
                    onChange={() => toggle(opt)}
                  />
                  <span>{opt}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
