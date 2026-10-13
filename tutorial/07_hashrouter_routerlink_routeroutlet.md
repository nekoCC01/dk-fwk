# Chapter 7: HashRouter / RouterLink / RouterOutlet

You click a link in a single‑page app.

The address bar changes from `#/home` to `#/about`, but:

- The browser doesn’t reload the page  
- Your JavaScript state stays alive  
- A different component appears on screen  

Who decided which component to show? How did it notice the URL change? And how did that blue “link” know not to trigger a full page load?

In this chapter you’ll meet the trio that makes this work in this framework:

- `HashRouter` – watches the URL hash and decides which route is active  
- `RouterLink` – link component that tells the router to navigate instead of reloading the page  
- `RouterOutlet` – a “reception desk” component that renders the component for the current route  

They sit on top of everything you’ve seen so far:

- VNodes and node types from [VNode / DOM_TYPES](01_vnode_dom_types.md)  
- The `h` helper and slots from [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md)  
- Components from [defineComponent / Component](03_definecomponent_component.md)  
- The DOM engine from [mountDOM / destroyDOM / patchDOM](04_mountdom_destroydom_patchdom.md)  
- The Dispatcher from [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md)  
- Slots again in [Slots and fillSlots](06_slots_and_fillslots.md)  

By the end you’ll be able to wire a tiny router into your app and understand how the URL, router, and components stay in sync.

---

## 1. Why a router at all?

Without a router, you can still build components and show or hide views based on state:

```js
if (this.state.page === 'home') {
  return h(HomePage)
} else if (this.state.page === 'about') {
  return h(AboutPage)
}
```

But then you must also:

- Change `page` when a link is clicked  
- Sync that with `window.location` so the URL is meaningful  
- Handle back / forward buttons  
- Parse URL params like `/users/42`  
- Handle query strings like `?search=abc`  

Doing that by hand quickly turns into a mess of `window.location.hash`, `addEventListener('popstate', ...)`, `history.pushState`, and your own parsing logic.

`HashRouter` takes all of that and turns it into something simple:

- You tell it what routes exist  
- It figures out which route matches the current hash  
- It exposes `matchedRoute`, `params`, and `query`  
- It broadcasts route changes to whoever cares  

`RouterLink` and `RouterOutlet` are just components that talk to this router.

---

## 2. Big picture: how navigation flows

Let’s first see the “script” for a navigation:

1. User clicks a `RouterLink`  
2. `RouterLink` stops the browser from doing a full navigation  
3. `RouterLink` asks the router: “navigate to this path”  
4. `HashRouter`:
   - Finds which route matches  
   - Updates `matchedRoute`, `params`, and `query`  
   - Updates the URL hash with `pushState`  
   - Notifies all subscribers that the route changed  
5. `RouterOutlet` is one of those subscribers  
6. `RouterOutlet` updates its state so its `render()` returns a different component  
7. The component system uses `patchDOM` to update the UI in place  

Here’s that as a sequence diagram:

```mermaid
sequenceDiagram
  participant User as User
  participant Link as RouterLink
  participant Router as HashRouter
  participant Outlet as RouterOutlet
  participant DOM as DomEngine

  User->>Link: Clicks on navigation link
  Link->>Router: Request navigation to path
  Router->>Router: Match route and update state
  Router->>Outlet: Notify about route change
  Outlet->>DOM: Re render with new route component
```

- `DomEngine` is the combination of `mountDOM` and `patchDOM` from [mountDOM / destroyDOM / patchDOM](04_mountdom_destroydom_patchdom.md).  
- `Router` uses the `Dispatcher` from [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md).  
- `Link` and `Outlet` are normal components from [defineComponent / Component](03_definecomponent_component.md).  

Now let’s zoom into each piece.

---

## 3. `HashRouter`: watching the hash and choosing the route

Think of `HashRouter` as a traffic control tower:

- It watches the “waypoints” (routes) you declare  
- It tracks the current “plane” (URL hash)  
- It tells listeners whenever the route changes  

The “hash router” idea: only the part after `#` matters to the router:

```text
https://example.com/#/users/42?tab=posts
                      ^^^^^^^^^^^^^^^^^
                            hash
```

Everything before `#` is ignored; the server never sees route changes.

### 3.1 Defining routes

Routes describe which component to show for which path:

```js
import { HashRouter } from './router'
import { Home } from './Home'
import { User } from './User'
import { NotFound } from './NotFound'

const routes = [
  { path: '/', component: Home },
  { path: '/users/:userId', component: User },
  { path: '*', component: NotFound },
]

const router = new HashRouter(routes)
```

A route object (from `route-matchers.js`) has:

- `path` – string like `/users/:userId` or `*`  
- `component` – the component to render  
- `redirect?` – optional path to redirect to  
- `beforeEnter?` – optional async guard to allow / block / redirect (more on this in [RouteMatcher / validateRoute](08_routematcher_validateroute.md))

`HashRouter` turns this array into an internal list of matchers using `makeRouteMatcher` (see [RouteMatcher / validateRoute](08_routematcher_validateroute.md) for details).

### 3.2 The router’s public face

From the `HashRouter` JSDoc:

```js
/**
 * @typedef {Object} Router
 *
 * @property {Route|null} matchedRoute
 * @property {Object<string, string>} params
 * @property {Object<string, string>} query
 *
 * @property {()=> Promise<void>} init
 * @property {() => void} destroy
 *
 * @property {(path: string) => Promise<void>} navigateTo
 * @property {() => void} back
 * @property {() => void} forward
 *
 * @property {(handler: RouteChangeHandler) => void} subscribe
 * @property {(handler: RouteChangeHandler) => void} unsubscribe
 */
```

You’ll mostly care about:

- `matchedRoute` – the current route object, or `null`  
- `params` – path parameters like `{ userId: '42' }`  
- `query` – query params like `{ search: 'abc' }`  
- `navigateTo(path)` – programmatic navigation  
- `subscribe(handler)` / `unsubscribe(handler)` – listen for route changes  

### 3.3 Initialization and hash listening

To start the router:

```js
await router.init()
```

Inside `init`:

```js
async init() {
  if (this.#isInitialized) {
    return
  }

  if (document.location.hash === '') {
    window.history.replaceState({}, '', '#/')
  }

  window.addEventListener('popstate', this.#onPopState)
  await this.#matchCurrentRoute()

  this.#isInitialized = true
}
```

Pieces:

- If there’s no `#` in the URL, it forces `#/`  
- Adds a `popstate` listener  
  - `popstate` fires when the user uses back/forward or `history.back()`/`forward()`  
- Immediately matches the current route (`#/something`)  

When you unmount the app (see [createApp / Application context](10_createapp_application_context.md)), `router.destroy()` removes the listener and unsubscribes subscribers.

### 3.4 Navigating to a path

Programmatic navigation happens through `navigateTo`:

```js
async navigateTo(path) {
  const matcher = this.#matchers.find((matcher) =>
    matcher.checkMatch(path)
  )

  if (matcher == null) {
    console.warn(`[Router] No route matches path "${path}"`)

    this.#matchedRoute = null
    this.#params = {}
    this.#query = {}

    return
  }

  if (matcher.isRedirect) {
    return this.navigateTo(matcher.route.redirect)
  }

  const from = this.#matchedRoute
  const to = matcher.route
  const { shouldNavigate, shouldRedirect, redirectPath } =
    await this.#canChangeRoute(from, to)

  if (shouldRedirect) {
    return this.navigateTo(redirectPath)
  }

  if (shouldNavigate) {
    this.#matchedRoute = matcher.route
    this.#params = matcher.extractParams(path)
    this.#query = matcher.extractQuery(path)
    this.#pushState(path)

    this.#dispatcher.dispatch(ROUTER_EVENT, { from, to, router: this })
  }
}
```

Think of this as: “decide where to go, update internal state, update the URL, then tell everyone.”

Step by step:

1. **Find a matching route**

   ```js
   const matcher = this.#matchers.find((matcher) =>
     matcher.checkMatch(path)
   )
   ```

   - Each matcher knows how to test a path and extract params/query.  
   - If none matches:
     - Log a warning  
     - Clear `matchedRoute`, `params`, `query`  

2. **Handle redirects**

   ```js
   if (matcher.isRedirect) {
     return this.navigateTo(matcher.route.redirect)
   }
   ```

   - A route can specify `redirect: '/new-path'`  
   - In that case, the router just re‑calls `navigateTo` with the new path.

3. **Check guards**

   ```js
   const from = this.#matchedRoute
   const to = matcher.route
   const { shouldNavigate, shouldRedirect, redirectPath } =
     await this.#canChangeRoute(from, to)
   ```

   - `#canChangeRoute` runs a `beforeEnter` guard if present  
   - It may block navigation or redirect (see [RouteMatcher / validateRoute](08_routematcher_validateroute.md) for the exact semantics).

4. **Apply navigation if allowed**

   ```js
   if (shouldNavigate) {
     this.#matchedRoute = matcher.route
     this.#params = matcher.extractParams(path)
     this.#query = matcher.extractQuery(path)
     this.#pushState(path)

     this.#dispatcher.dispatch(ROUTER_EVENT, { from, to, router: this })
   }
   ```

   - Save the new route, params, and query  
   - Push a new history entry with `#path`  
   - Use the internal `Dispatcher` to inform subscribers

The key line for UI updates is:

```js
this.#dispatcher.dispatch(ROUTER_EVENT, { from, to, router: this })
```

Anything that called `router.subscribe(handler)` will now get this object.

Routes triggered by the browser’s back/forward (`popstate`) go through the same `navigateTo` flow via `#matchCurrentRoute`.

### 3.5 Subscribing to route changes

At the heart of `subscribe` is the same `Dispatcher` pattern you saw in [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md):

```js
const ROUTER_EVENT = 'router-event'

#dispatcher = new Dispatcher()
#subscriptions = new WeakMap()
#subscriberFns = new Set()

subscribe(handler) {
  const unsubscribe = this.#dispatcher.subscribe(ROUTER_EVENT, handler)
  this.#subscriptions.set(handler, unsubscribe)
  this.#subscriberFns.add(handler)
}

unsubscribe(handler) {
  const unsubscribe = this.#subscriptions.get(handler)
  if (unsubscribe) {
    unsubscribe()
    this.#subscriptions.delete(handler)
    this.#subscriberFns.delete(handler)
  }
}
```

- `subscribe(handler)`:
  - Registers `handler` for `'router-event'` on the dispatcher  
  - Stores the returned `unsubscribe` function in a `WeakMap` keyed by `handler`  
- `unsubscribe(handler)`:
  - Looks up and runs that `unsubscribe` and cleans up references  

When `destroy()` runs, the router loops over all handlers to unsubscribe them:

```js
destroy() {
  if (!this.#isInitialized) {
    return
  }

  window.removeEventListener('popstate', this.#onPopState)
  Array.from(this.#subscriberFns).forEach(this.unsubscribe, this)
  this.#isInitialized = false
}
```

This is exactly the “bulletin board” analogy from [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md):

- `HashRouter` is a bulletin board for `'router-event'`  
- `subscribe` pins your handler on that board  
- `dispatch` calls everyone who’s pinned there  

`RouterOutlet` is one of these subscribers.

---

## 4. `RouterOutlet`: the receptionist component

`RouterOutlet` is the “front desk” of your app:

- It listens to the router  
- When the route changes, it swaps which component it renders  

It’s defined in `router-components.js` using `defineComponent` from [defineComponent / Component](03_definecomponent_component.md):

```js
import { defineComponent } from './component'
import { h } from './h'

export const RouterOutlet = defineComponent({
  state() {
    return {
      matchedRoute: null,
      subscription: null,
    }
  },

  onMounted() {
    const subscription = this.appContext.router.subscribe(({ to }) => {
      this.handleRouteChange(to)
    })

    this.updateState({ subscription })
  },

  onUnmounted() {
    const { subscription } = this.state
    this.appContext.router.unsubscribe(subscription)
  },

  handleRouteChange(matchedRoute) {
    this.updateState({ matchedRoute })
  },

  render() {
    const { matchedRoute } = this.state

    return h('div', { id: 'router-outlet' }, [
      matchedRoute ? h(matchedRoute.component) : null,
    ])
  },
})
```

Let’s break this into bite‑sized pieces.

### 4.1 State: tracking the current route

```js
state() {
  return {
    matchedRoute: null,
    subscription: null,
  }
}
```

- `matchedRoute` – the current `Route` object from the router (or `null`)  
- `subscription` – intended to track subscription info to unsubscribe later  

We’ll see why the unsubscribe line is slightly off in a moment.

### 4.2 Subscribing to the router in `onMounted`

```js
onMounted() {
  const subscription = this.appContext.router.subscribe(({ to }) => {
    this.handleRouteChange(to)
  })

  this.updateState({ subscription })
},
```

Important ideas:

- Components get `appContext` from the app (see [createApp / Application context](10_createapp_application_context.md)):

  ```js
  const context = {
    router: options.router || new NoopRouter(),
  }

  mountDOM(vdom, parentEl, null, { appContext: context })
  ```

  Every component instance’s `this.appContext` points to that shared object.

- In `RouterOutlet.onMounted`, we use that context to subscribe:

  ```js
  this.appContext.router.subscribe(({ to }) => {
    this.handleRouteChange(to)
  })
  ```

  The handler receives the payload from `HashRouter`:

  ```js
  { from, to, router }
  ```

  We ignore everything except `to` (the new route object) and forward it to a component method.

- The code stores whatever `router.subscribe` returns in `state.subscription`.  
  In this implementation `subscribe` does not return anything, so `subscription` ends up `undefined`. A more robust version would store the handler itself and call `router.unsubscribe(handler)` in `onUnmounted`.

The concept, though, is: “when I mount, I subscribe to route changes.”

### 4.3 Updating on route change

```js
handleRouteChange(matchedRoute) {
  this.updateState({ matchedRoute })
}
```

- `updateState` is from [defineComponent / Component](03_definecomponent_component.md): it merges the new state and calls `patchDOM` with the new render result.  
- Changing `matchedRoute` means the next `render()` will show a different component.

### 4.4 Cleaning up in `onUnmounted`

```js
onUnmounted() {
  const { subscription } = this.state
  this.appContext.router.unsubscribe(subscription)
},
```

- The intention is to unsubscribe from the router when `RouterOutlet` itself is unmounted.  
- In this specific code, `subscription` is `undefined`, so `unsubscribe` is a no‑op; but the router also unsubscribes everyone in `destroy()`, so app teardown is safe.

The main takeaway: `RouterOutlet` is polite and *tries* to clean up its listener, just like components unsubscribe from their own `Dispatcher` subscriptions (see [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md)).

### 4.5 Rendering the active route’s component

```js
render() {
  const { matchedRoute } = this.state

  return h('div', { id: 'router-outlet' }, [
    matchedRoute ? h(matchedRoute.component) : null,
  ])
},
```

This uses everything you know from earlier chapters:

- `h` from [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md) to create VNodes  
- Conditional child `matchedRoute ? ... : null` – `null` is filtered out by `withoutNulls` in `h.js`  
- If a `matchedRoute` exists, it renders that route’s component:

  ```js
  h(matchedRoute.component)
  ```

  Since `tag` is a component constructor, `h` creates a `COMPONENT` VNode. Then `mountDOM` / `patchDOM` from [mountDOM / destroyDOM / patchDOM](04_mountdom_destroydom_patchdom.md) will mount or patch that component and its subtree.

So `RouterOutlet` is literally just:

> “Wrap a `div` around whichever page component the router says is active.”

You typically use it inside your app’s root component:

```js
import { defineComponent } from './component'
import { h } from './h'
import { RouterOutlet } from './router-components'

export const App = defineComponent({
  render() {
    return h('div', null, [
      h('h1', null, ['My App']),
      h(RouterOutlet),
    ])
  },
})
```

---

## 5. `RouterLink`: a link that talks to the router

Imagine you’ve wired your `HashRouter` and `RouterOutlet`. Now you need navigation links that:

- Look like normal links (`<a href="/users">Users</a>`)  
- But don’t reload the page  
- And instead ask the router to navigate  

That’s what `RouterLink` does.

Here’s the definition from `router-components.js`:

```js
import { defineComponent } from './component'
import { h, hSlot } from './h'

export const RouterLink = defineComponent({
  render() {
    const { to } = this.props

    return h(
      'a',
      {
        href: to,
        on: {
          click: (e) => {
            e.preventDefault()
            this.appContext.router.navigateTo(to)
          },
        },
      },
      [hSlot()]
    )
  },
})
```

Breakdown:

### 5.1 Props and the `to` path

```js
const { to } = this.props
```

- Consumers write something like `h(RouterLink, { to: '/users' }, ['Users'])`.  
- `to` is the path to navigate to (like `/users/42?tab=posts`).

### 5.2 Rendering as a regular anchor element

```js
h(
  'a',
  {
    href: to,
    on: { /* events */ },
  },
  [hSlot()]
)
```

- `tag: 'a'` makes an `ELEMENT` VNode.  
- The `href: to` attribute is set so:
  - Right‑click “Open in new tab” still works  
  - Long‑press on mobile shows the expected URL  
  - Copy link address works  

This is a graceful fallback: if JS is disabled, clicking the link will still try to navigate the browser to `#/path`, which at least shows the URL.

### 5.3 Intercepting clicks and using the router

```js
on: {
  click: (e) => {
    e.preventDefault()
    this.appContext.router.navigateTo(to)
  },
},
```

When the user clicks:

1. `e.preventDefault()` stops the browser’s default full‑page navigation.  
2. `this.appContext.router.navigateTo(to)` hands control to `HashRouter`:
   - Finds the matching route  
   - Updates state and URL  
   - Dispatches the router event  

The click handler is a DOM event handler described in [mountDOM / destroyDOM / patchDOM](04_mountdom_destroydom_patchdom.md) and `events.js`:

- The `on` prop is extracted by `extractPropsAndEvents`  
- `mountDOM` uses `addEventListeners` to attach the handler to the `<a>` element  
- If `RouterLink` is inside another component, the handler’s `this` is bound to that component instance  

### 5.4 Using a slot for the link label

```js
[hSlot()]
```

`RouterLink` uses a slot to accept any child content inside the `<a>`:

- If you use `h(RouterLink, { to: '/home' }, ['Home'])`, the `'Home'` text becomes the slot content.  
- `hSlot()` creates a slot VNode (see [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md)).  
- When `RouterLink.render()` returns, the internal component wrapper calls `fillSlots` from [Slots and fillSlots](06_slots_and_fillslots.md), replacing the slot with the external content.

So you can have:

```js
h(RouterLink, { to: '/home' }, ['Home'])

h(RouterLink, { to: '/settings' }, [
  h('span', { class: 'icon-settings' }),
  h('span', null, ['Settings']),
])
```

In both cases, `RouterLink` only controls:

- The tag (`a`)  
- The `href` and click behavior  

The caller controls the inner content.

---

## 6. Plugging the router into the app

The final piece is how you create and wire a router when you create the app. That happens in `createApp` (see [createApp / Application context](10_createapp_application_context.md)).

A typical bootstrapping might look like this:

```js
import { createApp, HashRouter } from './index'
import { App } from './App'

const routes = [
  { path: '/', component: Home },
  { path: '/users/:userId', component: User },
  { path: '*', component: NotFound },
]

const router = new HashRouter(routes)

const app = createApp(App, {}, { router })
app.mount(document.getElementById('app'))
```

Under the hood, `createApp` does:

```js
export function createApp(RootComponent, props = {}, options = {}) {
  // ...

  const context = {
    router: options.router || new NoopRouter(),
  }

  return {
    mount(_parentEl) {
      // ...
      vdom = h(RootComponent, props)
      mountDOM(vdom, parentEl, null, { appContext: context })

      context.router.init()
      // ...
    },

    unmount() {
      destroyDOM(vdom)
      context.router.destroy()
      // ...
    },
  }
}
```

Key points:

- The router you pass in becomes `context.router`.  
- `mountDOM` passes `{ appContext: context }` to the root so that every component can access `this.appContext.router`.  
- After mounting the root VNode, the app calls `router.init()` to:
  - Ensure a hash exists  
  - Start listening to `popstate`  
  - Match the initial route  

When you `unmount()` the app, `destroyDOM` tears down the component tree, and `router.destroy()` removes event listeners and subscribers.

So your entire navigation infrastructure is just another object hanging off the app context, much like global services in other frameworks.

---

## 7. Reading params and query inside route components

`RouterOutlet` passes only the `component` from `matchedRoute` into the view:

```js
matchedRoute ? h(matchedRoute.component) : null
```

So how does a page like `User` know which user to show?

It uses `this.appContext.router.params` and `this.appContext.router.query`.

Example:

```js
import { defineComponent } from './component'
import { h } from './h'

export const User = defineComponent({
  state() {
    return { userId: null }
  },

  onMounted() {
    const { router } = this.appContext
    const { userId } = router.params
    this.updateState({ userId })
  },

  render() {
    const { userId } = this.state

    return h('div', null, [
      h('h2', null, [`User ${userId}`]),
    ])
  },
})
```

Routing aspects:

- In `routes` you might have `{ path: '/users/:userId', component: User }`.  
- When the router matches `/users/42`, it uses the `RouteMatcher` from [RouteMatcher / validateRoute](08_routematcher_validateroute.md) to set:

  ```js
  router.params = { userId: '42' }
  ```

- `router.query` works similarly for `?foo=bar` via `URLSearchParams`.

Because the router instance is part of `appContext`, **any** component can read the current route, not just the one inside `RouterOutlet`.

---

## 8. Putting it all together: a tiny routed app

Let’s wire all three pieces quickly:

```js
// routes.js
import { Home } from './Home'
import { User } from './User'
import { NotFound } from './NotFound'

export const routes = [
  { path: '/', component: Home },
  { path: '/users/:userId', component: User },
  { path: '*', component: NotFound },
]
```

```js
// App.js
import { defineComponent } from './component'
import { h } from './h'
import { RouterLink, RouterOutlet } from './router-components'

export const App = defineComponent({
  render() {
    return h('div', null, [
      h('nav', null, [
        h(RouterLink, { to: '/' }, ['Home']),
        h(RouterLink, { to: '/users/42' }, ['User 42']),
      ]),
      h(RouterOutlet),
    ])
  },
})
```

```js
// main.js
import { createApp, HashRouter } from './index'
import { App } from './App'
import { routes } from './routes'

const router = new HashRouter(routes)
const app = createApp(App, {}, { router })

app.mount(document.getElementById('app'))
```

What you get:

- Clicking “Home” or “User 42” updates the hash (`#/` or `#/users/42`).  
- The router matches the route and dispatches the route change.  
- `RouterOutlet` re‑renders with `Home` or `User`.  
- `User` reads `userId` from `this.appContext.router.params`.  

All using the same building blocks you’ve met so far: components, VNodes, the DOM engine, dispatchers, and slots.

---

## 9. Recap

You’ve now seen how this framework’s routing layer works like a small, self‑contained transport system:

- **`HashRouter`**:
  - Watches `window.location.hash` and `popstate`  
  - Uses route matchers from [RouteMatcher / validateRoute](08_routematcher_validateroute.md) to pick a route  
  - Keeps `matchedRoute`, `params`, and `query` up to date  
  - Broadcasts route changes via a `Dispatcher`  

- **`RouterOutlet`**:
  - Is a component that subscribes to the router on mount  
  - Stores `matchedRoute` in its own state  
  - Renders `h(matchedRoute.component)` inside a `<div id="router-outlet">`  

- **`RouterLink`**:
  - Is a component that renders an `<a>` tag with `href=to`  
  - Intercepts clicks with a DOM event and calls `router.navigateTo(to)`  
  - Uses a slot so callers can control link content  

All three are thin layers on top of:

- Components from [defineComponent / Component](03_definecomponent_component.md)  
- VNodes and `h` from [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md)  
- The DOM and diffing engine from [mountDOM / destroyDOM / patchDOM](04_mountdom_destroydom_patchdom.md)  
- The Dispatcher from [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md)  
- Slots from [Slots and fillSlots](06_slots_and_fillslots.md)  

Now that you’ve seen the router from the outside, the natural next question is: **how exactly do those route matchers work**?

- How does `/users/:id` turn into a regex?  
- How are params and query extracted?  
- How does the router ensure that routes are valid?

That’s what you’ll explore next in [RouteMatcher / validateRoute](08_routematcher_validateroute.md).