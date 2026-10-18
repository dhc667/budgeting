const realFetch = globalThis.fetch;

// A test that reaches the internet is slow and nondeterministic: rates providers, for one, publish
// dates that depend on the hour. Stub the provider instead.
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input, "http://localhost");
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error(`Integration tests must not reach the network, but fetched ${url.href}.`);
  }
  return realFetch(input, init);
};
