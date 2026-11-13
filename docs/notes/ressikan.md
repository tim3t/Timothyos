# RESSIKAN

Working notes for Claude, moved out of `CLAUDE.md` on 2026-11-11 (the index there lists every notes file). Text below is unchanged from before the move.

## RESSIKAN (2.44; revamped 2.82, D82)

`js/src/25-ressikan.js`, one inner function `rs` (its own names; CSS all `rs-`): `rs.render/head/click/leave/card`. Two cards since 2.82 (Timothy's approved mockup, 2026-11-13): **CHORDS** and **SOLO**. The theremin (FIELD), the beat ring and DRIFT are gone (Timothy: "retire the theremin for now"; SOLO replaced DRIFT).

**The room** (unchanged from 2.44.1): buses chord, bass, beat (through the kit's low-pass), solo → bus → tape wow → lo-fi (staircase shaper, band-limit) → echo (dotted eighth, sent from chords and solo) and convolver reverb → compressor → master, plus a MediaStreamDestination for RECORD. `start()` builds a new AudioContext on every SOUND ON (closing the old; Safari's "interrupted" state never woke the reused one); SOUND OFF suspends it after the fade; `onstatechange` away from running while on calls `lost()` (IPADOS PAUSED THE SOUND). e55 wraps `AudioContext` to check this.

**Harmony:** slots are `{d: degree 0-6, c: "" | 7 | 9 | sus2 | sus4 | 6, b: borrowed}`; `scaleFor(b)` flips major/minor for BORROW. `chordName`/`numeral` derive from the intervals (a borrowed chord gets ♭/♯ against the home scale). Flats for F, B♭, E♭, A♭, D♭, G♭ (minor keys by their relative major). `voice()` puts each note in the octave nearest 0.6 × the last chord's centre + 0.4 × 62, so changes move little; a live tap over the playing loop doesn't move the loop's voicing. Bass: the root in 36-45, on the bar and step 10.

**Clock:** 16ths with lookahead (1.5 s while hidden), swing on odd steps (`k.swing` × 60%, × .66 of a 16th), `schedule(n, t)` plays drums (humanize ±7 ms, fill on the last bar: snare rolls, hats out), the chord at the slot's start by style (HOLD, STRUM down then up at step 8, STAB on steps 2/6/10/14, ARP up/down/updown/random over two octaves), and posts the playhead to `paintPlay()`, which only toggles classes (never redraws, so a SOLO touch survives). Pads play on `pointerdown` (an instrument); the click that follows is ignored within 800 ms, so Enter/Space still work.

**SOLO:** one mono voice (`soloV`) gliding between notes (`k.glide`), vibrato fading in; BELL strikes each note instead. Pads are the scale (`SSCALES`: pentatonic, full, blues; each by mode) from a base near middle C (+ OCTAVE), two rows and the top note. The chord sounding now (or the first) lights its pitch classes (`.tone`, root `.root`). Pointer capture on the surface; `elementFromPoint` finds the pad under a sliding finger; the last finger still down keeps sounding.

**Saved:** `tos.ressikan.v1` with `v: 2`, compact so PROFILE SYNC (20,000 characters an item) carries 12 loops: slots as `"d:c[:b]"`, the grid as six 16-digit strings (0 off, 1 on, 2 accent). An older (FIELD) setting keeps only `key`, `fx`, `vinyl`. Loops: `snapshot()` / `openLoop()` (validated on the way in). **SAVE AS MIDI** (`midiFile()`): type 1, 96 ticks a beat, tempo and 4/4, chords held per slot (GM program by sound), bass (33), drums on channel 10 (GM notes 36, 38, 39, 42, 46, 70), mutes and the fill respected. `saveFile()` uses the share sheet with a File, else a download.

Tests: `app_e2e55`.
