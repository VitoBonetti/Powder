/**
 * Executes a list of tasks with a maximum number of concurrent executions.
 * @param {number} limit - Max concurrent promises.
 * @param {Array<Function>} tasks - Array of functions that return a Promise.
 */
export async function limitConcurrency(limit, tasks) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    executing.add(p);

    // Remove from executing set when finished
    const clean = () => executing.delete(p);
    p.then(clean, clean);

    // If we hit the limit, wait for one to finish before starting next
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}