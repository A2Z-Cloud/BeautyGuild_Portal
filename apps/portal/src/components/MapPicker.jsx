import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// The pin is the Guild pink, drawn here so no image file has to be found. A school drags it, or taps the map, to the right place.
const PIN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 38" width="30" height="38" aria-hidden="true">' +
  '<path d="M15 1C7.8 1 2 6.6 2 13.6 2 23 15 37 15 37s13-14 13-23.4C28 6.6 22.2 1 15 1z" fill="#ee3e96" stroke="#fff" stroke-width="2.5"/>' +
  '<circle cx="15" cy="13.5" r="5" fill="#fff"/></svg>';
const PIN_ICON = L.divIcon({ html: PIN, className: 'centre-map-pin', iconSize: [30, 38], iconAnchor: [15, 37] });
const START = [52.8, -1.6];
const valid = (lat, lng) =>
  lat !== null &&
  lat !== '' &&
  lng !== null &&
  lng !== '' &&
  Number.isFinite(Number(lat)) &&
  Number.isFinite(Number(lng));

export default function MapPicker({ latitude, longitude, onChange, label = 'Training centre location map' }) {
  const box = useRef(null),
    map = useRef(null),
    marker = useRef(null),
    notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => {
    if (!box.current || map.current) return undefined;
    const has = valid(latitude, longitude),
      start = has ? [Number(latitude), Number(longitude)] : START;
    // On a phone one finger scrolls the page, not the map: the pin is still draggable, and the buttons and pinch move the map.
    const m = L.map(box.current, { scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView(start, has ? 16 : 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    const pin = L.marker(start, { draggable: true, icon: PIN_ICON, opacity: has ? 1 : 0 }).addTo(m);
    const set = ll => {
      pin.setLatLng(ll).setOpacity(1);
      notify.current && notify.current({ latitude: ll.lat, longitude: ll.lng });
    };
    pin.on('dragend', () => set(pin.getLatLng()));
    m.on('click', e => set(e.latlng));
    map.current = m;
    marker.current = pin;
    const resize = () => m.invalidateSize();
    setTimeout(resize, 0);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(box.current);
    return () => {
      if (observer) observer.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is made once; later points move it in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!map.current || !marker.current) return;
    if (!valid(latitude, longitude)) {
      marker.current.setOpacity(0);
      return;
    }
    const at = [Number(latitude), Number(longitude)];
    marker.current.setLatLng(at).setOpacity(1);
    map.current.setView(at, Math.max(map.current.getZoom(), 16));
  }, [latitude, longitude]);
  return <div ref={box} className="centre-map" role="application" aria-label={label} />;
}
