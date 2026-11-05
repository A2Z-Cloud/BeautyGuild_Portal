import test from 'node:test';
import assert from 'node:assert/strict';
import { coursesAt, venuesOf } from './courseVenues.js';

const OFFERINGS = [
  { id: '1', name: 'Gel Polish', trainingCentre: 'Derby Studio', trainingCentreId: '401' },
  { id: '2', name: 'Lash Lift', trainingCentre: 'Leeds Studio', trainingCentreId: '402' },
  { id: '3', name: 'Brow Lamination', trainingCentre: 'Derby Studio', trainingCentreId: '401' },
];
test('venues are the distinct places that have a course, by name', () => {
  assert.deepEqual(venuesOf(OFFERINGS), [
    { id: '401', name: 'Derby Studio' },
    { id: '402', name: 'Leeds Studio' },
  ]);
  assert.deepEqual(venuesOf([]), []);
  assert.equal(
    venuesOf([{ id: '9', name: 'X', trainingCentre: 'Solo' }])[0].id,
    'Solo',
    'falls back to the venue name',
  );
});
test('courses are filtered to the chosen venue and sorted by name', () => {
  assert.deepEqual(
    coursesAt(OFFERINGS, '401').map(o => o.id),
    ['3', '1'],
  );
  assert.deepEqual(
    coursesAt(OFFERINGS, '402').map(o => o.id),
    ['2'],
  );
  assert.deepEqual(coursesAt(OFFERINGS, ''), []);
  assert.deepEqual(coursesAt(OFFERINGS, '999'), []);
});
