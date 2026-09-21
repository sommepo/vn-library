// Build outside the visible tree, decode the entire composition, then commit once.
// This prevents separate body/face HTTP requests from becoming separate paints.
export async function decodeSceneImages(root, timeoutMs=30000) {
  let timer;
  try {
    await Promise.race([
      Promise.all([...root.querySelectorAll('img')].map(async img=>{
        try { await img.decode(); }
        catch { throw new Error(`Scene image could not load: ${img.dataset.asset || new URL(img.src).pathname}. Retry or reload to resume.`); }
      })),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Scene images took too long to load. Check your connection and retry.')),timeoutMs);}),
    ]);
  } finally { clearTimeout(timer); }
}
