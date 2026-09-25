import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage<{ user: string }>();
const actual = await Promise.all(['first', 'second'].map((user, index) =>
  context.run({ user }, async () => {
    await new Promise(resolve => setTimeout(resolve, index ? 1 : 20));
    return context.getStore()?.user;
  })
));
if (JSON.stringify(actual) !== '["first","second"]' || context.getStore() !== undefined) {
  throw new Error('Request context isolation failed');
}
console.log('AYN_ASYNC_CONTEXT_PASS');
Deno.serve(() => new Response('AYN_ASYNC_CONTEXT_PASS'));
