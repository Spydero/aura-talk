export async function notifyHouse(houseId: string) {
  const url = process.env.REALTIME_INTERNAL_URL ?? "http://127.0.0.1:3848";
  try {
    await fetch(`${url}/internal/broadcast`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": process.env.INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify({ houseId }),
      cache: "no-store",
    });
  } catch {
    // The socket server can be restarting. The next presence update catches up.
  }
}
