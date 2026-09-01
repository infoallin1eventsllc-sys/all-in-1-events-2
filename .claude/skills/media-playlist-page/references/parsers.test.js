const fs = require("fs");
const src = fs.readFileSync(require("path").join(__dirname, "embed-parsers.js"), "utf8");
// Pull the parsers out; the render functions need a DOM we don't have here.
const ctx = { URLSearchParams };
const body = src;
new Function("URLSearchParams", body + "\nthis.p={parseSpotify,parseAppleMusic,parseYouTubePlaylist,parseYouTubeVideo,parseLocalPath};").call(ctx, URLSearchParams);
const P = ctx.p;

let fail = 0;
const t = (name, got, want) => {
  const ok = got === want;
  if (!ok) { fail++; console.log(`  FAIL ${name}\n    got:  ${got}\n    want: ${want}`); }
  else console.log(`  ok   ${name}`);
};

console.log("Spotify:");
t("share link + tracking param", P.parseSpotify("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc123"), "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M");
t("URI form", P.parseSpotify("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"), "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M");
t("bare id", P.parseSpotify("37i9dQZF1DXcBWIGoYBM5M"), "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M");
t("already an embed link", P.parseSpotify("https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M"), "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M");
t("empty", P.parseSpotify(""), null);
t("an album, not a playlist", P.parseSpotify("https://open.spotify.com/album/37i9dQZF1DXcBWIGoYBM5M"), null);
t("http not https", P.parseSpotify("http://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"), null);
t("lookalike host", P.parseSpotify("https://open.spotify.com.evil.tld/playlist/37i9dQZF1DXcBWIGoYBM5M"), null);
t("javascript scheme", P.parseSpotify("javascript:alert(1)"), null);
t("quote break-out attempt", P.parseSpotify('37i9dQZF1DXcBWIGoY"onload="alert(1)'), null);

console.log("Apple Music:");
t("share link", P.parseAppleMusic("https://music.apple.com/us/playlist/the-sound/pl.u-abc123"), "https://embed.music.apple.com/us/playlist/the-sound/pl.u-abc123");
t("with query", P.parseAppleMusic("https://music.apple.com/gb/playlist/the-sound/pl.u-abc123?l=en"), "https://embed.music.apple.com/gb/playlist/the-sound/pl.u-abc123");
t("already embed host", P.parseAppleMusic("https://embed.music.apple.com/us/playlist/the-sound/pl.u-abc123"), "https://embed.music.apple.com/us/playlist/the-sound/pl.u-abc123");
t("an album, not a playlist", P.parseAppleMusic("https://music.apple.com/us/album/x/12345"), null);
t("lookalike host", P.parseAppleMusic("https://music.apple.com.evil.tld/us/playlist/a/pl.b"), null);

console.log("YouTube playlist:");
t("playlist page", P.parseYouTubePlaylist("https://www.youtube.com/playlist?list=PLabc123def456"), "https://www.youtube-nocookie.com/embed/videoseries?list=PLabc123def456");
t("watch link carrying a list", P.parseYouTubePlaylist("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123def456"), "https://www.youtube-nocookie.com/embed/videoseries?list=PLabc123def456");
t("bare id", P.parseYouTubePlaylist("PLabc123def456"), "https://www.youtube-nocookie.com/embed/videoseries?list=PLabc123def456");
t("watch link with no list", P.parseYouTubePlaylist("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), null);
t("lookalike host", P.parseYouTubePlaylist("https://youtube.com.evil.tld/playlist?list=PLabc123def456"), null);

console.log("YouTube video:");
t("youtu.be", P.parseYouTubeVideo("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
t("watch link", P.parseYouTubeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
t("shorts", P.parseYouTubeVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
t("bare id", P.parseYouTubeVideo("dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
t("wrong length id", P.parseYouTubeVideo("dQw4w9WgXc"), null);

console.log("Local path:");
t("relative file", P.parseLocalPath("assets/video/fleece.mp4"), "assets/video/fleece.mp4");
t("parent traversal", P.parseLocalPath("../../etc/passwd"), null);
t("absolute", P.parseLocalPath("/etc/passwd"), null);
t("javascript scheme", P.parseLocalPath("javascript:alert(1)"), null);
t("remote url", P.parseLocalPath("https://evil.tld/x.mp4"), null);

console.log(fail ? `\n${fail} FAILED` : "\nAll parser tests passed.");
process.exit(fail ? 1 : 0);
