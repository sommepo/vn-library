// Playwright 1.55 waitForFunction treats a Promise as truthy. IndexedDB probes
// must be awaited in Node and then polled on their resolved Boolean result.
export async function pollBrowser(check, description, timeout=30000) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,50));}
  throw new Error('Timed out waiting for '+description);
}
