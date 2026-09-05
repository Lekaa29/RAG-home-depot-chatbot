import type { Item, Location } from "../api";

export function Controls({
  items,
  locations,
  itemId,
  locationId,
  onItemChange,
  onLocationChange,
  onFindRoute,
  distanceFt,
}: {
  items: Item[];
  locations: Location[];
  itemId: number | null;
  locationId: number | null;
  onItemChange: (id: number) => void;
  onLocationChange: (id: number) => void;
  onFindRoute: () => void;
  distanceFt: number | null;
}) {
  return (
    <div className="controls">
      <h1>Store Navigator</h1>

      <label>
        I'm looking for
        <select
          value={itemId ?? ""}
          onChange={(e) => onItemChange(Number(e.target.value))}
        >
          <option value="" disabled>
            Select an item…
          </option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} (Aisle {item.aisle_num})
            </option>
          ))}
        </select>
      </label>

      <label>
        My current location
        <select
          value={locationId ?? ""}
          onChange={(e) => onLocationChange(Number(e.target.value))}
        >
          <option value="" disabled>
            Select a location…
          </option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      </label>

      <button onClick={onFindRoute} disabled={itemId == null || locationId == null}>
        Show me the way
      </button>

      {distanceFt != null && (
        <p className="distance">≈ {Math.round(distanceFt)} ft walk</p>
      )}
    </div>
  );
}
