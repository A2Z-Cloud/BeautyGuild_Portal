import React, { Suspense, useEffect, useRef, useState } from 'react';
import { portalApi } from '../services/api.js';
import { centreCountry } from '../accreditationInputs.js';

const MapPicker = React.lazy(() => import('./MapPicker.jsx'));

// Confirm the training centre on a map (Guild, 5 November 2026; V1 did this with Loqate and a draggable pin). The point is looked up from
// the centre address, the school drags the pin if it is wrong, and it is saved on the training centre so the website map shows it.
const addressOf = v =>
  [v.centreAddress1, v.centreTown, v.centreCounty, v.centrePostcode, centreCountry(v)].filter(Boolean).join(', ');
const ready = v => Boolean(v.centreAddress1 && v.centreTown && centreCountry(v));
const hasPoint = v => v.centreLatitude !== undefined && v.centreLatitude !== '' && v.centreLongitude !== '';

export default function LocationConfirm({ values, onChange }) {
  const [state, setState] = useState({ busy: false, message: '' });
  const [round, setRound] = useState(0);
  const address = addressOf(values);
  const located = hasPoint(values);
  // The address the point belongs to. A saved draft's point is taken to be for the address it comes back with.
  const forAddress = useRef(located ? address : '');
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!ready(values)) return undefined;
    if (located && forAddress.current === address) return undefined;
    if (located) {
      // The address moved: the old pin no longer means anything.
      latest.current('centreLatitude', '');
      latest.current('centreLongitude', '');
      forAddress.current = '';
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setState({ busy: true, message: '' });
      try {
        const point = await portalApi.geocodeAddress(centreCountry(values), address);
        if (cancelled) return;
        forAddress.current = address;
        if (point) {
          latest.current('centreLatitude', String(point.latitude));
          latest.current('centreLongitude', String(point.longitude));
          setState({ busy: false, message: '' });
        } else {
          setState({
            busy: false,
            message: 'We could not find this address on the map. Tap the map to place the pin where your centre is.',
          });
        }
      } catch {
        if (!cancelled)
          setState({
            busy: false,
            message: 'The map lookup is unavailable. You can tap the map to place the pin, or carry on without it.',
          });
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, located, round]);

  const move = ({ latitude, longitude }) => {
    forAddress.current = address;
    onChange('centreLatitude', String(Number(latitude.toFixed(7))));
    onChange('centreLongitude', String(Number(longitude.toFixed(7))));
    setState({ busy: false, message: '' });
  };
  const searchAgain = () => {
    onChange('centreLatitude', '');
    onChange('centreLongitude', '');
    forAddress.current = '';
    setState({ busy: false, message: '' });
    setRound(r => r + 1);
  };
  if (!ready(values))
    return (
      <div className="centre-location">
        <h4>Confirm your centre&rsquo;s location</h4>
        <p className="muted">Enter the centre address above and we will show it on a map.</p>
      </div>
    );
  return (
    <div className="centre-location">
      <h4>Confirm your centre&rsquo;s location</h4>
      <p className="muted">
        Drag the pin to your training centre. It is used for the map on your page on the Guild website. This step is
        optional.
      </p>
      <Suspense fallback={<p role="status">Loading the map…</p>}>
        <MapPicker latitude={values.centreLatitude} longitude={values.centreLongitude} onChange={move} />
      </Suspense>
      <div className="centre-location-bar">
        <span role="status">
          {state.busy
            ? 'Finding this address…'
            : located
              ? 'Pin placed. Drag it if it is not quite right.'
              : state.message || ''}
        </span>
        <button type="button" className="text-button" disabled={state.busy} onClick={searchAgain}>
          Search again
        </button>
      </div>
    </div>
  );
}
