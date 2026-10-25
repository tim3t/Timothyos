# Vendored libraries

Loaded only when SCIENCE needs them (the station, the Bridge's SCIENCE line, the Morning Briefing), and kept for offline use by `sw.js`.

| File | Library | Version | Licence |
|---|---|---|---|
| `satellite.min.js` | [satellite.js](https://github.com/shashwatak/satellite-js) (SGP4 orbits from TLEs) | 5.0.0 | MIT, header kept |
| `astronomy.min.js` | [Astronomy Engine](https://github.com/cosinekitty/astronomy) (Sun, Moon, planets, eclipses) | 2.1.19 | MIT, header kept |

Copied unchanged from npm. To update: `npm pack satellite.js@<v> astronomy-engine@<v>` and copy `dist/satellite.min.js` and `astronomy.browser.min.js`.
