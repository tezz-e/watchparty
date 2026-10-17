# Local media library

Place media files you are authorized to use in this directory. Afterglow lists and serves top-level `.mp4` and `.webm` files through its local library provider. The server supports HTTP byte-range requests so browsers can seek within supported media.

Media files are ignored by Git and remain on the machine running the server. The server distributes playback state and media URLs; it does not upload or relay the video contents.
