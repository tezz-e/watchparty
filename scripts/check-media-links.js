const urls = process.argv.slice(2);

if (!urls.length) {
  console.error("Usage: npm run check:media-links -- <https-media-url> [<https-media-url> ...]");
  process.exitCode = 2;
} else {
  for (const value of urls) {
    let url;
    try {
      url = new URL(value);
    } catch {
      console.error(`FAIL invalid URL: ${value}`);
      process.exitCode = 1;
      continue;
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      console.error(`FAIL expected a public HTTPS URL without embedded credentials: ${value}`);
      process.exitCode = 1;
      continue;
    }
    try {
      const response = await fetch(url, { headers: { Range: "bytes=0-0" } });
      const range = response.headers.get("content-range") || "";
      const rangeSupported = response.status === 206 && /^bytes 0-0\/\d+$/i.test(range);
      console.log(`${rangeSupported ? "PASS" : "FAIL"} ${response.status} ${range || "no Content-Range"} ${url.href}`);
      await response.body?.cancel();
      if (!rangeSupported) process.exitCode = 1;
    } catch (error) {
      console.error(`FAIL ${url.href}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
