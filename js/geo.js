/**
 * geo.js
 * Geospatial utilities.
 *   norm()          – normalise a string for fuzzy comparison
 *   randomPointIn() – sample a random land point inside a GeoJSON feature
 */

/* global turf */

/**
 * Normalise a country name for comparison:
 * lowercase, strip diacritics, collapse separators.
 * @param {string} s
 * @returns {string}
 */
export function norm(s) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/['''`]/g, '')                            // strip apostrophes
    .replace(/[-–—_]/g, ' ')                           // hyphens → space
    .replace(/[^a-z0-9 ]/g, '')                        // strip remaining punct
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return a random [lat, lng] pair that falls on land inside `feature`.
 *
 * For MultiPolygon features (archipelagos, etc.) each polygon is weighted
 * by its area so that the sampling is proportional to land area within the country.
 * A rejection-sampling loop handles concave or irregular shapes.
 *
 * @param {GeoJSON.Feature} feature
 * @returns {[number, number]}  [lat, lng]
 */
export function randomPointIn(feature) {
  const geom = feature.geometry;

  // Collect individual polygons
  const polys = geom.type === 'Polygon'
    ? [turf.polygon(geom.coordinates)]
    : geom.coordinates.map(c => turf.polygon(c));

  // Pick a polygon weighted by area (ensures fair sampling across islands)
  const areas = polys.map(p => turf.area(p));
  const total = areas.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let chosen = polys[0];
  for (let i = 0; i < polys.length; i++) {
    r -= areas[i];
    if (r <= 0) { chosen = polys[i]; break; }
  }

  // Rejection sampling inside bounding box
  const bbox = turf.bbox(chosen);
  for (let i = 0; i < 300; i++) {
    const lng = bbox[0] + Math.random() * (bbox[2] - bbox[0]);
    const lat = bbox[1] + Math.random() * (bbox[3] - bbox[1]);
    const pt  = turf.point([lng, lat]);
    if (turf.booleanPointInPolygon(pt, chosen)) return [lat, lng];
  }

  // Fallback: centroid (should almost never be reached)
  const c = turf.centroid(chosen);
  return [c.geometry.coordinates[1], c.geometry.coordinates[0]];
}

/**
 * Choose a Leaflet zoom level that gives useful context for a country's size.
 * @param {GeoJSON.Feature} feature
 * @returns {number}
 */
export function zoomForFeature(feature) {
  const bbox = turf.bbox(feature);
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  if (span > 45) return 4;
  if (span > 15) return 5;
  if (span >  4) return 6;
  return 7;
}
