# There's a Dilbert for that!

Describe an absurd workplace situation and find the Dilbert strips that match.

**Unofficial fan project.** Not affiliated with or endorsed by the creator or
rights holders of Dilbert. The MIT licence covers this project's code only.
Dilbert strips and their text belong to their respective rights holders. This
repository contains no strip images.

## Try it

[Download DilbertSearch.zip](https://github.com/solbech/theres-a-dilbert-for-that/releases/latest/download/DilbertSearch.zip),
unzip it and open `index.html` in Chrome, Edge or Safari. There is nothing to
install and search works offline. To see the strips themselves, follow
[Showing the strips](#showing-the-strips).

## Building it yourself

Setup and status are in `CLAUDE.md`. `npm install`, `npm run fetch-model`, then `npm run build` writes the app to `build/app/`. `npm run package` then writes `build/DilbertSearch.zip` from it.

## Showing the strips

Search works without the strips, but showing them needs your own copy of the
archive, which this project does not provide. You can look for one by searching
for "download dilbert archive". Check that you are allowed to use any copy you
find.

1. Download and unpack the archive anywhere you like. The app expects year folders
   (`1989`, `1990` and so on) directly inside the archive folder.
2. **Chrome:** open Settings in the app, set Archive location to that folder, for
   example `/Users/you/Dilbert` or `C:\Dilbert`, and click Test location. On
   Windows, Edge works the same way.
3. **Safari:** Safari only lets the page load images from its own folder, so put
   the app files inside the archive folder, next to the year folders. The app then
   finds the strips by itself.
4. If the folders or filenames differ, run `index-archive.command` once, or
   `index-archive.bat` on Windows. Both ship with the app, find each strip by the
   `YYYY-MM-DD` in its filename and write `archive-index.js` next to themselves.
