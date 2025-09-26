export function oncePer(ms = 600) {
  let lock = false;
  return (fn: () => void | Promise<void>) => async () => {
    if (lock) return;
    lock = true;
    try { 
      await fn(); 
    } finally { 
      setTimeout(() => { lock = false; }, ms); 
    }
  };
}