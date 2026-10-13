# Chapter 4: mountDOM / destroyDOM / patchDOM

Imagine you click a button in your app and a list item disappears.

On the screen, that might mean:

- Removing one `<li>` from the middle of a `<ul>`
- Updating a counter somewhere else
- Maybe even tearing down a whole component if that item was a reusable widget

But your JavaScript code didn’t say “remove the third DOM child, then decrement that span, then detach these listeners.” It just re-ran a `render()` function that returned a new VNode tree, like we built in:

- [VNode / DOM_TYPES](01_vnode_dom_types.md)  
- [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md)  
- [defineComponent / Component](03_definecomponent_component.md)

So: **who actually touches the real DOM?**

That’s the job of three functions:

- `mountDOM` – build the initial DOM from a VNode tree  
- `patchDOM` – compare an old VNode tree and a new one, and apply the smallest DOM changes  
- `destroyDOM` – tear the DOM down and clean up

They’re like a construction crew working from blueprints:

- `mountDOM` builds the building  
- `patchDOM` remodels just the changed rooms  
- `destroyDOM` demolishes the building safely  

This chapter is about understanding how that crew works.

---

## 1. Where these functions fit in the big picture

Let’s connect a full UI cycle:

1. A component instance has `state` and `props` (from [defineComponent / Component](03_definecomponent_component.md)).
2. The component’s `render()` returns a **VNode tree** using `h`, `hFragment`, `hSlot` (from [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md)).
3. On first render, `mountDOM` walks that VNode tree and **creates real DOM nodes**.
4. When `state` or `props` change, the component re-runs `render()` to get a **new VNode tree**.
5. `patchDOM` compares **old vs new** and **mutates the existing DOM**.
6. When something goes away (component unmount, route change, full app unmount), `destroyDOM` walks the old tree and **removes DOM + listeners + components**.

The only way the browser ever hears from your framework is through these three functions.

Let’s walk them one by one.

---

## 2. mountDOM: from blueprint to real DOM

Think of `mountDOM` as “print this blueprint as a real house.”

Its signature:

```js
export function mountDOM(vdom, parentEl, index, hostComponent = null) {
  if (parentEl == null) {
    throw new Error('[mountDOM] Parent element is null')
  }

  switch (vdom.type) {
    case DOM_TYPES.TEXT: {
      createTextNode(vdom, parentEl, index)
      break
    }

    case DOM_TYPES.ELEMENT: {
      createElementNode(vdom, parentEl, index, hostComponent)
      break
    }

    case DOM_TYPES.FRAGMENT: {
      createFragmentNodes(vdom, parentEl, index, hostComponent)
      break
    }

    case DOM_TYPES.COMPONENT: {
      createComponentNode(vdom, parentEl, index, hostComponent)
      enqueueJob(() => vdom.component.onMounted())
      break
    }

    default: {
      throw new Error(`Can't mount DOM of type: ${vdom.type}`)
    }
  }
}
```

Key ideas:

- It **switches on `vdom.type`** (from [VNode / DOM_TYPES](01_vnode_dom_types.md)):
  - text
  - element
  - fragment
  - component
- It always:
  - Creates the appropriate real DOM (or component instance)
  - Stores references back on the VNode (`vdom.el`, `vdom.component`)
  - Inserts the result into `parentEl` at `index` if one is provided

It never sees `DOM_TYPES.SLOT` because slots are resolved *inside* components before mounting, using `fillSlots` from [Slots and fillSlots](06_slots_and_fillslots.md).

Let’s look at each case.

---

### 2.1 Mounting text nodes

Blueprint: a `TEXT` VNode from `hString` or via `h`:

```js
const textVNode = { type: 'text', value: 'Hello' }
```

`mountDOM` calls:

```js
function createTextNode(vdom, parentEl, index) {
  const { value } = vdom

  const textNode = document.createTextNode(value)
  vdom.el = textNode

  insert(textNode, parentEl, index)
}
```

What happens:

- Creates a real `Text` node with the correct string
- Stores it on `vdom.el`
- Inserts it into the parent at a specific position (via `insert` – we’ll see it soon)

Analogy: this is like writing the label on a sticky note and placing it in the right spot.

---

### 2.2 Mounting element nodes

Blueprint: an `ELEMENT` VNode from `h('button', props, children)`:

```js
const buttonVNode = {
  type: 'element',
  tag: 'button',
  props: { id: 'save', on: { click: handler } },
  children: [ /* text or other VNodes */ ],
}
```

`mountDOM` delegates to:

```js
function createElementNode(vdom, parentEl, index, hostComponent) {
  const { tag, children } = vdom

  const element = document.createElement(tag)
  addProps(element, vdom, hostComponent)
  vdom.el = element

  children.forEach((child) => mountDOM(child, element, null, hostComponent))
  insert(element, parentEl, index)
}
```

Step by step:

1. `document.createElement(tag)` creates a real DOM element.
2. `addProps` applies attributes and events.
3. `vdom.el = element` stores the DOM reference.
4. Recursively `mountDOM` for each child into this new element.
5. Insert the final element into its parent.

Props and events are handled here:

```js
function addProps(el, vdom, hostComponent) {
  const { props: attrs, events } = extractPropsAndEvents(vdom)

  vdom.listeners = addEventListeners(events, el, hostComponent)
  setAttributes(el, attrs)
}
```

- `extractPropsAndEvents` splits `vdom.props` into:
  - `attrs` – normal attributes (`id`, `class`, `style`, etc.)
  - `events` – the `on: { click, input, ... }` object
- `addEventListeners` attaches real DOM listeners, binding them to `hostComponent` if provided (so `this` inside handlers is the component instance; see [defineComponent / Component](03_definecomponent_component.md) and `events.js`).
- `setAttributes` writes attributes and styles to the element.

Like decorating a newly built room: paint walls, hang pictures, wire the doorbell.

---

### 2.3 Mounting fragments

Blueprint: a `FRAGMENT` VNode from `hFragment([...children...])`.

Fragments are “multiple siblings, no wrapper.” They do **not** create a wrapper DOM node. Instead, `vdom.el` points to the **parent element** that holds all its children.

```js
function createFragmentNodes(vdom, parentEl, index, hostComponent) {
  const { children } = vdom
  vdom.el = parentEl

  for (const child of children) {
    mountDOM(child, parentEl, index, hostComponent)

    if (index == null) {
      continue
    }

    switch (child.type) {
      case DOM_TYPES.FRAGMENT:
        index += child.children.length
        break
      case DOM_TYPES.COMPONENT:
        index += child.component.elements.length
        break
      default:
        index++
    }
  }
}
```

Details:

- It loops through each child and mounts it directly into `parentEl`.
- If `index` is provided, it carefully increments it so that:
  - A plain node advances index by 1.
  - A nested fragment advances by its **number of children**.
  - A component advances by its **number of root DOM elements** (via `component.elements` from [defineComponent / Component](03_definecomponent_component.md)).

Analogy: a fragment is a stack of posters pinned individually to the same wall. The fragment itself *is* the wall reference (`vdom.el = parentEl`).

---

### 2.4 Mounting components

Blueprint: a `COMPONENT` VNode created by `h(MyComponent, props, children)`.

`mountDOM` calls:

```js
function createComponentNode(vdom, parentEl, index, hostComponent) {
  const { tag: Component, children } = vdom
  const { props, events } = extractPropsAndEvents(vdom)
  const component = new Component(props, events, hostComponent)
  component.setExternalContent(children)
  component.setAppContext(hostComponent?.appContext ?? {})

  component.mount(parentEl, index)
  vdom.component = component
  vdom.el = component.firstElement
}
```

What this does:

1. `tag` is the **Component class** from `defineComponent`.
2. `extractPropsAndEvents` splits:
   - `props` → passed into the component instance  
   - `events` → handlers the *parent* wants to react to when the child calls `emit` (see [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md)).
3. `new Component(props, events, hostComponent)` creates an instance.
4. `setExternalContent(children)` stores children for slots.
5. `setAppContext` injects global context (router, etc. from [createApp / Application context](10_createapp_application_context.md)).
6. `component.mount(parentEl, index)`:
   - Calls the component’s own `render()`
   - Uses `mountDOM` again on the returned VNode
7. `vdom.component = component` stores the instance on the VNode.
8. `vdom.el = component.firstElement`:
   - For use by the diff algorithm when moving components around
   - Even if the component has multiple root nodes (fragments), this is the first DOM element

Right after creating the component, `mountDOM` also queues its lifecycle hook:

```js
case DOM_TYPES.COMPONENT: {
  createComponentNode(vdom, parentEl, index, hostComponent)
  enqueueJob(() => vdom.component.onMounted())
  break
}
```

`enqueueJob` (from [Scheduler / nextTick](09_scheduler_nexttick.md)) ensures `onMounted` runs **asynchronously**, after mounting is complete.

Analogy: creating a mini construction crew for a building inside your building. You just allocate them space and give them their blueprints; they handle their own rooms, furniture, and events.

---

### 2.5 Precise insertion with `insert`

All the “create” helpers eventually call `insert`:

```js
function insert(el, parentEl, index) {
  if (index == null) {
    parentEl.append(el)
    return
  }

  if (index < 0) {
    throw new Error(`Index must be a positive integer, got ${index}`)
  }

  const children = parentEl.childNodes

  if (index >= children.length) {
    parentEl.append(el)
  } else {
    parentEl.insertBefore(el, children[index])
  }
}
```

Rules:

- No index → append to the end.
- Index in range → insert before current child at that index.
- Index beyond end → append.
- Negative index → error.

This is how the framework can:

- Mount children at exact positions
- Later, re-use positions when replacing nodes (as we’ll see in `patchDOM`)

---

## 3. destroyDOM: tearing things down safely

When a piece of UI disappears (component unmounted, route changed, item removed), the framework must:

- Remove DOM nodes  
- Remove listeners  
- Unmount child components and run their lifecycle hooks  

That’s what `destroyDOM` does.

```js
export function destroyDOM(vdom) {
  const { type } = vdom

  switch (type) {
    case DOM_TYPES.TEXT: {
      removeTextNode(vdom)
      break
    }

    case DOM_TYPES.ELEMENT: {
      removeElementNode(vdom)
      break
    }

    case DOM_TYPES.FRAGMENT: {
      removeFragmentNodes(vdom)
      break
    }

    case DOM_TYPES.COMPONENT: {
      vdom.component.unmount()
      enqueueJob(() => vdom.component.onUnmounted())
      break
    }

    default: {
      throw new Error(`Can't destroy DOM of type: ${type}`)
    }
  }

  delete vdom.el
}
```

Same pattern: **switch on `type`** and delegate.

---

### 3.1 Removing text nodes

```js
function removeTextNode(vdom) {
  const { el } = vdom

  assert(el instanceof Text)

  el.remove()
}
```

It:

- Checks `el` really is a `Text`
- Calls `el.remove()` to detach it from the DOM

The VNode itself lives on (without `el`) only if the parent component or patch process still holds references.

---

### 3.2 Removing element nodes

```js
function removeElementNode(vdom) {
  const { el, children, listeners } = vdom

  assert(el instanceof HTMLElement)

  el.remove()
  children.forEach(destroyDOM)

  if (listeners) {
    removeEventListeners(listeners, el)
    delete vdom.listeners
  }
}
```

Steps:

1. Remove the element from the DOM.
2. Recursively `destroyDOM` each child VNode (their DOM is nested under this element).
3. If there are stored DOM listeners (`vdom.listeners` from `mountDOM`), call `removeEventListeners` to detach them.

Analogy: not just demolishing the house, but also cutting off electricity, water, and alarms.

---

### 3.3 Removing fragments

```js
function removeFragmentNodes(vdom) {
  const { children } = vdom
  children.forEach(destroyDOM)
}
```

No wrapper element to remove; just recursively destroy each child that this fragment had introduced into its parent.

---

### 3.4 Removing components

Destroying a component is a two-step dance:

1. Let the component tear down its own internal DOM and subscriptions.
2. Run its `onUnmounted` hook.

```js
case DOM_TYPES.COMPONENT: {
  vdom.component.unmount()
  enqueueJob(() => vdom.component.onUnmounted())
  break
}
```

From the component side (in `component.js`):

```js
unmount() {
  if (!this.#isMounted) {
    throw new Error('Component is not mounted')
  }

  destroyDOM(this.#vdom)
  this.#subscriptions.forEach((unsubscribe) => unsubscribe())

  this.#vdom = null
  this.#isMounted = false
  this.#hostEl = null
  this.#subscriptions = []
}
```

- Calls `destroyDOM` on its internal VNode tree
- Unsubscribes from its event dispatcher subscriptions (the `emit` machinery from [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md))
- Clears VNode, flags, and references

The `onUnmounted` lifecycle hook is queued via the scheduler, similar to `onMounted`.

The net result: no lingering DOM, no dangling event handlers, no leaked component instances.

---

## 4. patchDOM: updating the DOM efficiently

`mountDOM` is called only once per subtree: the **first** time something appears.

When state or props change in a component, that component:

1. Calls `render()` to get a new VNode tree.
2. Calls `patchDOM(oldVdom, newVdom, parentEl, this)` to update the DOM in place.

`patchDOM` is the “remodeling” crew: change as little as possible, reuse as much as possible.

Here is the core function:

```js
export function patchDOM(oldVdom, newVdom, parentEl, hostComponent = null) {
  if (!areNodesEqual(oldVdom, newVdom)) {
    const index = findIndexInParent(parentEl, oldVdom.el)
    destroyDOM(oldVdom)
    mountDOM(newVdom, parentEl, index, hostComponent)

    return newVdom
  }

  newVdom.el = oldVdom.el

  switch (newVdom.type) {
    case DOM_TYPES.TEXT: {
      patchText(oldVdom, newVdom)
      return newVdom
    }

    case DOM_TYPES.ELEMENT: {
      patchElement(oldVdom, newVdom, hostComponent)
      break
    }

    case DOM_TYPES.COMPONENT: {
      patchComponent(oldVdom, newVdom)
      break
    }
  }

  patchChildren(oldVdom, newVdom, hostComponent)

  return newVdom
}
```

Let’s break this down.

---

### 4.1 Step 1: are these nodes “the same kind”?

Before touching anything, `patchDOM` asks: *can I reuse this DOM node at all?*

```js
if (!areNodesEqual(oldVdom, newVdom)) {
  const index = findIndexInParent(parentEl, oldVdom.el)
  destroyDOM(oldVdom)
  mountDOM(newVdom, parentEl, index, hostComponent)

  return newVdom
}
```

`areNodesEqual` (from `nodes-equal.js`) answers that:

```js
export function areNodesEqual(nodeOne, nodeTwo) {
  if (nodeOne.type !== nodeTwo.type) {
    return false
  }

  if (nodeOne.type === DOM_TYPES.ELEMENT) {
    const {
      tag: tagOne,
      props: { key: keyOne },
    } = nodeOne
    const {
      tag: tagTwo,
      props: { key: keyTwo },
    } = nodeTwo

    return tagOne === tagTwo && keyOne === keyTwo
  }

  if (nodeOne.type === DOM_TYPES.COMPONENT) {
    const {
      tag: componentOne,
      props: { key: keyOne },
    } = nodeOne
    const {
      tag: componentTwo,
      props: { key: keyTwo },
    } = nodeTwo

    return componentOne === componentTwo && keyOne === keyTwo
  }

  return true
}
```

Rules:

- Different `type` (element vs text vs component) → cannot reuse
- `ELEMENT`:
  - Same `tag` and same `key` → can reuse
- `COMPONENT`:
  - Same component class and same `key` → can reuse
- Others (text, fragment) → considered “compatible enough”

If not equal:

- `findIndexInParent` figures out where the old DOM lived among its siblings:

  ```js
  function findIndexInParent(parentEl, el) {
    const index = Array.from(parentEl.childNodes).indexOf(el)
    if (index < 0) {
      return null
    }

    return index
  }
  ```

- `destroyDOM(oldVdom)` removes the old DOM and components.
- `mountDOM(newVdom, parentEl, index, hostComponent)` inserts a fresh subtree in exactly the same place.

Analogy: if you change “sink” to “bathtub” in a bathroom, you demolish the sink and install a new bathtub; you don’t try to reuse the sink pipes as a tub.

---

### 4.2 Step 2: reuse DOM node and patch in place

If `areNodesEqual` returns true, then the basic “shape” matches and we can reuse the existing DOM node:

```js
newVdom.el = oldVdom.el
```

We **copy** the DOM reference from old → new, instead of re-mounting.

Then, depending on `newVdom.type`, we patch differently.

---

### 4.3 Patching text nodes

```js
function patchText(oldVdom, newVdom) {
  const el = oldVdom.el
  const { value: oldText } = oldVdom
  const { value: newText } = newVdom

  if (oldText !== newText) {
    el.nodeValue = newText
  }
}
```

- If the text changed, update `nodeValue`.
- Otherwise, do nothing.

---

### 4.4 Patching element nodes

Element patching has two parts:

1. Update the element itself (attributes, classes, styles, events).
2. Update its children.

The first part happens in `patchElement`:

```js
function patchElement(oldVdom, newVdom, hostComponent) {
  const el = oldVdom.el
  const {
    class: oldClass,
    style: oldStyle,
    on: oldEvents,
    ...oldAttrs
  } = oldVdom.props
  const {
    class: newClass,
    style: newStyle,
    on: newEvents,
    ...newAttrs
  } = newVdom.props
  const { listeners: oldListeners } = oldVdom

  patchAttrs(el, oldAttrs, newAttrs)
  patchClasses(el, oldClass, newClass)
  patchStyles(el, oldStyle, newStyle)
  newVdom.listeners = patchEvents(
    el,
    oldListeners,
    oldEvents,
    newEvents,
    hostComponent
  )
}
```

#### 4.4.1 Attributes

```js
function patchAttrs(el, oldAttrs, newAttrs) {
  const { added, removed, updated } = objectsDiff(oldAttrs, newAttrs)

  for (const attr of removed) {
    removeAttribute(el, attr)
  }

  for (const attr of added.concat(updated)) {
    setAttribute(el, attr, newAttrs[attr])
  }
}
```

- `objectsDiff` figures out which attribute keys:
  - Were removed
  - Were added
  - Stayed but changed value
- Then:
  - Remove old-only attributes
  - Set values for added or updated ones

This means your DOM attributes reflect current props exactly.

#### 4.4.2 Classes

```js
function patchClasses(el, oldClass, newClass) {
  const oldClasses = toClassList(oldClass)
  const newClasses = toClassList(newClass)

  const { added, removed } = arraysDiff(oldClasses, newClasses)

  if (removed.length > 0) {
    el.classList.remove(...removed)
  }
  if (added.length > 0) {
    el.classList.add(...added)
  }
}
```

- `toClassList` normalizes string or array class props into arrays of class names.
- `arraysDiff` computes which classes were added or removed, even with duplicates.
- `classList.remove` and `classList.add` handle the actual DOM change.

#### 4.4.3 Styles

```js
function patchStyles(el, oldStyle = {}, newStyle = {}) {
  const { added, removed, updated } = objectsDiff(oldStyle, newStyle)

  for (const style of removed) {
    removeStyle(el, style)
  }

  for (const style of added.concat(updated)) {
    setStyle(el, style, newStyle[style])
  }
}
```

This mirrors `patchAttrs`, but inside `style`:

- Remove styles that no longer exist
- Set new or changed styles

#### 4.4.4 Events

```js
function patchEvents(
  el,
  oldListeners = {},
  oldEvents = {},
  newEvents = {},
  hostComponent
) {
  const { removed, added, updated } = objectsDiff(oldEvents, newEvents)
  const listeners = { ...oldListeners }

  for (const eventName of removed.concat(updated)) {
    el.removeEventListener(eventName, oldListeners[eventName])
    delete listeners[eventName]
  }

  for (const eventName of added.concat(updated)) {
    const listener = addEventListener(
      eventName,
      newEvents[eventName],
      el,
      hostComponent
    )
    listeners[eventName] = listener
  }

  return listeners
}
```

- Events to remove or update:
  - Call `removeEventListener` with the **previous bound handler** (`oldListeners[eventName]`).
- Events to add or update:
  - Call `addEventListener` again, possibly rebinding to a new callback
  - Store new bound handler into `listeners`

Finally, `newVdom.listeners` is set so any future patch or destroy can remove them correctly.

Analogy: carefully update a room’s fixtures: change the bulbs, rewire switches, repaint walls, but keep the room itself intact.

---

### 4.5 Patching component nodes

Patching a component VNode is not about touching DOM directly. Instead, we delegate to the component instance, which knows how to re-render itself:

```js
function patchComponent(oldVdom, newVdom) {
  const { component } = oldVdom
  const { children } = newVdom
  const { props } = extractPropsAndEvents(newVdom)

  component.setExternalContent(children)
  component.updateProps(props)

  newVdom.component = component
  newVdom.el = component.firstElement
}
```

- Reuse the same `component` instance (we know it’s the same type + key from `areNodesEqual`).
- Update:
  - Its external slot content
  - Its `props` via `updateProps`, which triggers the component’s internal render + `patchDOM` of its subtree
- Point `newVdom.component` and `newVdom.el` to the same instance and its first DOM element.

This is how the parent can change props while each component remains a stable island of state and DOM logic (as described in [defineComponent / Component](03_definecomponent_component.md)).

---

### 4.6 Patching children arrays

After patching an element or component itself, the next question is: **what about its children?**

This is especially tricky when:

- Children are rearranged
- Fragments are involved
- Some children are components (which are multi-element islands)

`patchChildren` handles this:

```js
function patchChildren(oldVdom, newVdom, hostComponent) {
  const oldChildren = extractChildren(oldVdom)
  const newChildren = extractChildren(newVdom)
  const parentEl = oldVdom.el

  const diffSeq = arraysDiffSequence(
    oldChildren,
    newChildren,
    areNodesEqual
  )

  for (const operation of diffSeq) {
    const { originalIndex, index, item } = operation
    const offset = computeChildrenOffset(oldVdom, hostComponent)

    switch (operation.op) {
      case ARRAY_DIFF_OP.ADD: {
        mountDOM(item, parentEl, index + offset, hostComponent)
        break
      }

      case ARRAY_DIFF_OP.REMOVE: {
        destroyDOM(item)
        break
      }

      case ARRAY_DIFF_OP.MOVE: {
        const oldChild = oldChildren[originalIndex]
        const newChild = newChildren[index]
        const elAtTargetIndex = parentEl.childNodes[index + offset]

        const elementsToMove = isComponent(oldChild)
          ? oldChild.component.elements
          : [oldChild.el]

        elementsToMove.forEach((el) => {
          parentEl.insertBefore(el, elAtTargetIndex)
          patchDOM(oldChild, newChild, parentEl, hostComponent)
        })

        break
      }

      case ARRAY_DIFF_OP.NOOP: {
        patchDOM(
          oldChildren[originalIndex],
          newChildren[index],
          parentEl,
          hostComponent
        )
        break
      }
    }
  }
}
```

Important pieces:

#### 4.6.1 Flattening fragments

`extractChildren` (from `h.js`) returns a flat list of children, replacing fragment nodes with their children:

```js
export function extractChildren(vdom) {
  if (vdom.children == null) {
    return []
  }

  const children = []

  for (const child of vdom.children) {
    if (child.type === DOM_TYPES.FRAGMENT) {
      children.push(...extractChildren(child))
    } else {
      children.push(child)
    }
  }

  return children
}
```

Why? Fragments don’t get their own DOM wrapper; their children become real siblings in the DOM. To match that, we diff **flat** children lists.

#### 4.6.2 Computing add / remove / move / noop

`arraysDiffSequence` (from `utils/arrays.js`) compares:

- `oldChildren`
- `newChildren`
- Using `areNodesEqual` to decide if two children are the “same kind”

It returns a sequence of operations:

- `ADD` – mount a new VNode at some index
- `REMOVE` – remove a VNode that no longer exists
- `MOVE` – same node (type + key) moved to a different index
- `NOOP` – existing node reused, just patch contents

This is like a choreographed plan: “add, move, move, noop, remove” that, if applied in order, transforms the old children list into the new one.

#### 4.6.3 Host component offset

When children belong to a component, the indices used in the VNode arrays might not start at 0 in the actual DOM. The component might be offset inside its parent.

`computeChildrenOffset` adjusts for that:

```js
function computeChildrenOffset(oldVdom, hostComponent = null) {
  if (hostComponent == null) {
    return 0
  }

  if (oldVdom.el === hostComponent.hostEl) {
    return hostComponent.offset
  }

  return 0
}
```

- If we’re patching the top-level children of a component’s root, `hostComponent.offset` gives the index of that component’s first element in the parent.
- We add this offset when we:
  - `ADD` – mount at `index + offset`
  - `MOVE` – find `elAtTargetIndex` at `index + offset`

Without this, components with fragment roots would be moved or inserted at the wrong positions in the parent DOM.

#### 4.6.4 Handling MOVE with components

The `MOVE` case is subtle:

```js
case ARRAY_DIFF_OP.MOVE: {
  const oldChild = oldChildren[originalIndex]
  const newChild = newChildren[index]
  const elAtTargetIndex = parentEl.childNodes[index + offset]

  const elementsToMove = isComponent(oldChild)
    ? oldChild.component.elements
    : [oldChild.el]

  elementsToMove.forEach((el) => {
    parentEl.insertBefore(el, elAtTargetIndex)
    patchDOM(oldChild, newChild, parentEl, hostComponent)
  })

  break
}
```

If the moved child is:

- A plain element or text node → just one `el` to move.
- A component → could be several root DOM elements (if it uses a fragment). We must move *all* of them, keeping their internal order.

Then, after moving, we call `patchDOM(oldChild, newChild, parentEl, hostComponent)` to patch its internals, in case something else changed besides its position.

Analogy: if you move a whole bookshelf (component with fragment root) from one wall to another, you move the *entire* shelf with all books, not just the first book.

---

## 5. How mounting, patching, and destroying interact

To see the dance between these three functions, let’s look at a typical component lifecycle: mounted once, updated twice, then destroyed.

We’ll include:

- `Comp` – the component instance  
- `Render` – the component’s `render` method  
- `Mount` – the `mountDOM` logic  
- `Patch` – the `patchDOM` logic  
- `Destroy` – the `destroyDOM` logic  

```mermaid
sequenceDiagram
  participant Comp as Component
  participant Render as Render
  participant Mount as MountDOM
  participant Patch as PatchDOM
  participant Destroy as DestroyDOM

  Comp->>Render: Build initial virtual tree
  Render-->>Comp: Return initial virtual tree
  Comp->>Mount: Mount initial tree into host
  Comp->>Render: Build updated virtual tree after state change
  Render-->>Comp: Return updated virtual tree
  Comp->>Patch: Patch old tree with new tree
  Comp->>Destroy: Destroy current tree on unmount
```

Tie this back to previous chapters:

- The tree `Render` builds is made of VNodes and `DOM_TYPES` from [VNode / DOM_TYPES](01_vnode_dom_types.md).
- `MountDOM`, `PatchDOM`, `DestroyDOM` use those `type` labels and shapes created by `h` / `hFragment` / `hSlot` from [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md).
- The `Comp` participant is an instance created via [defineComponent / Component](03_definecomponent_component.md).

---

## 6. How this is used at the app level

Finally, how does this all connect to the top of the app?

In `createApp` (from [createApp / Application context](10_createapp_application_context.md)):

```js
export function createApp(RootComponent, props = {}, options = {}) {
  let parentEl = null
  let isMounted = false
  let vdom = null

  const context = {
    router: options.router || new NoopRouter(),
  }

  function reset() {
    parentEl = null
    isMounted = false
    vdom = null
  }

  return {
    mount(_parentEl) {
      if (isMounted) {
        throw new Error('The application is already mounted')
      }

      parentEl = _parentEl
      vdom = h(RootComponent, props)
      mountDOM(vdom, parentEl, null, { appContext: context })

      context.router.init()

      isMounted = true
    },

    unmount() {
      if (!isMounted) {
        throw new Error('The application is not mounted')
      }

      destroyDOM(vdom)
      context.router.destroy()
      reset()
    },
  }
}
```

- On `mount`:
  - Create a root VNode: `h(RootComponent, props)`
  - Call `mountDOM` with a special “host component” object that only carries `appContext`
  - Initialize the router
- On `unmount`:
  - Call `destroyDOM` on the entire root VNode
  - Tear down the router

Everything in between (state updates, route changes, event handlers) eventually leads to `patchDOM` or `destroyDOM` operations down the tree.

---

## 7. Recap

You’ve now met the three low-level workers of this framework:

- **`mountDOM`** – walks a VNode tree and:
  - Creates text, element, fragment, and component DOM
  - Stores references on VNodes (`el`, `component`, `listeners`)
  - Inserts at precise indices in the parent
  - Schedules `onMounted` for components

- **`patchDOM`** – given an old and new VNode:
  - Uses `areNodesEqual` to decide whether to reuse or fully replace
  - Updates:
    - Text node content
    - Element attributes, classes, styles, events
    - Component props and slot content
  - Diffs children arrays (with fragments and components), doing add / remove / move / noop with minimal DOM operations

- **`destroyDOM`** – walks a VNode tree and:
  - Removes DOM nodes
  - Cleans up listeners
  - Unmounts components and schedules `onUnmounted`

They live underneath the abstractions you’ve already seen:

- VNode shapes and `DOM_TYPES` from [VNode / DOM_TYPES](01_vnode_dom_types.md)
- VNode creation helpers from [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md)
- Component instances from [defineComponent / Component](03_definecomponent_component.md)

They’re the reason you can write:

```js
this.updateState({ count: this.state.count + 1 })
```

and never think about `createElement`, `appendChild`, or `removeEventListener` again.

---

Now that your construction crew is in place, there’s one more big question: **how do components talk to each other without tight coupling?**

You saw a hint in `patchComponent`, where parents pass “event handlers” to children. In the next chapter, [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md), we’ll see how a tiny event bus lets components emit events upward in a clean, decoupled way—like a restaurant kitchen bell that any chef can ring and the head chef can respond to.