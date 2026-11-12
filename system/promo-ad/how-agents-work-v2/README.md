# "How AI agents work", second cut: the new look (12 Nov 2026)

Otis asked to move the videos off the dark navy and try something new (Impeccable skill,
connectors). This is the agents film rebuilt in the direction from `../looks/`: tall condensed
headlines (League Gothic) over Montserrat, one idea per frame, the app card as a large tilted
prop, a colour wipe on every cut. Same script and timings as `../how-agents-work/` (23.4 s of
film, 27.4 s with the ending). **No credits, no licensed music.** Not posted.

Four colourways, one file: `scenes.html#look=day|signal|emerald|stage&fmt=9x16|4x5|1x1|16x9`.
`out/` holds the 9:16 preview of each look, sent to Otis to choose from.

The ending is his logo light-up on navy, **unchanged at his request** ("leave the logo the way
it is and see what happens at the end; if I like it we keep it, if not we change it"). The film
wipes into it (xfade wiperight, 0.4 s): a dissolve from yellow or green to navy went muddy.

Build: `./build.sh <work_dir> <python with numpy+scipy> "<looks>" "<shapes>"`.
Once he picks a look: `./build.sh <work> <py> "<look>" "9x16 4x5 1x1 16x9"`.
Check each shape's safe zones before sending (`preview.mjs <fmt> <look> <dir> t...`).
