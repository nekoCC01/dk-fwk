function addEventListeners(
  listeners = {},
  el,
  hostComponent = null
) {
  const addedListeners = {};
  Object.entries(listeners).forEach(([eventName, handler]) => {
    const listener = addEventListener(eventName, handler, el, hostComponent);
    addedListeners[eventName] = listener;
  });
  return addedListeners
}
function addEventListener(
  eventName,
  handler,
  el,
  hostComponent = null
) {
  function boundHandler() {
    hostComponent
      ? handler.apply(hostComponent, arguments)
      : handler(...arguments);
  }
  el.addEventListener(eventName, boundHandler);
  return boundHandler
}
function removeEventListeners(listeners = {}, el) {
  Object.entries(listeners).forEach(([eventName, handler]) => {
    el.removeEventListener(eventName, handler);
  });
}

function mapsDiff(oldMap, newMap) {
  const oldKeys = Array.from(oldMap.keys());
  const newKeys = Array.from(newMap.keys());
  return {
    added: newKeys.filter((key) => !oldMap.has(key)),
    removed: oldKeys.filter((key) => !newMap.has(key)),
    updated: newKeys.filter(
      (key) => oldMap.has(key) && oldMap.get(key) !== newMap.get(key)
    ),
  }
}
function makeCountMap(array) {
  const map = new Map();
  for (const item of array) {
    map.set(item, (map.get(item) || 0) + 1);
  }
  return map
}

function withoutNulls(arr) {
  return arr.filter((item) => item != null)
}
function arraysDiff(oldArray, newArray) {
  const oldsCount = makeCountMap(oldArray);
  const newsCount = makeCountMap(newArray);
  const diff = mapsDiff(oldsCount, newsCount);
  const added = diff.added.flatMap((key) =>
    Array(newsCount.get(key)).fill(key)
  );
  const removed = diff.removed.flatMap((key) =>
    Array(oldsCount.get(key)).fill(key)
  );
  for (const key of diff.updated) {
    const oldCount = oldsCount.get(key);
    const newCount = newsCount.get(key);
    const delta = newCount - oldCount;
    if (delta > 0) {
      added.push(...Array(delta).fill(key));
    } else {
      removed.push(...Array(-delta).fill(key));
    }
  }
  return {
    added,
    removed,
  }
}
const ARRAY_DIFF_OP = {
  ADD: 'add',
  REMOVE: 'remove',
  MOVE: 'move',
  NOOP: 'noop',
};
function arraysDiffSequence(
  oldArray,
  newArray,
  equalsFn = (a, b) => a === b
) {
  const sequence = [];
  const array = new ArrayWithOriginalIndices(oldArray, equalsFn);
  for (let index = 0; index < newArray.length; index++) {
    if (array.isRemoval(index, newArray)) {
      sequence.push(array.removeItem(index));
      index--;
      continue
    }
    if (array.isNoop(index, newArray)) {
      sequence.push(array.noopItem(index));
      continue
    }
    const item = newArray[index];
    if (array.isAddition(item, index)) {
      sequence.push(array.addItem(item, index));
      continue
    }
    sequence.push(array.moveItem(item, index));
  }
  sequence.push(...array.removeItemsAfter(newArray.length));
  return sequence
}
class ArrayWithOriginalIndices {
  #array = []
  #originalIndices = []
  #equalsFn
  constructor(array, equalsFn) {
    this.#array = [...array];
    this.#originalIndices = array.map((_, i) => i);
    this.#equalsFn = equalsFn;
  }
  get length() {
    return this.#array.length
  }
  originalIndexAt(index) {
    return this.#originalIndices[index]
  }
  findIndexFrom(item, fromIndex) {
    for (let i = fromIndex; i < this.length; i++) {
      if (this.#equalsFn(item, this.#array[i])) {
        return i
      }
    }
    return -1
  }
  isRemoval(index, newArray) {
    if (index >= this.length) {
      return false
    }
    const item = this.#array[index];
    const indexInNewArray = newArray.findIndex((newItem) =>
      this.#equalsFn(item, newItem)
    );
    return indexInNewArray === -1
  }
  removeItem(index) {
    const operation = {
      op: ARRAY_DIFF_OP.REMOVE,
      index,
      item: this.#array[index],
    };
    this.#array.splice(index, 1);
    this.#originalIndices.splice(index, 1);
    return operation
  }
  isNoop(index, newArray) {
    if (index >= this.length) {
      return false
    }
    const item = this.#array[index];
    const newItem = newArray[index];
    return this.#equalsFn(item, newItem)
  }
  noopItem(index) {
    return {
      op: ARRAY_DIFF_OP.NOOP,
      index,
      originalIndex: this.originalIndexAt(index),
      item: this.#array[index],
    }
  }
  isAddition(item, fromIdx) {
    return this.findIndexFrom(item, fromIdx) === -1
  }
  addItem(item, index) {
    const operation = {
      op: ARRAY_DIFF_OP.ADD,
      index,
      item,
    };
    this.#array.splice(index, 0, item);
    this.#originalIndices.splice(index, 0, -1);
    return operation
  }
  moveItem(item, toIndex) {
    const fromIndex = this.findIndexFrom(item, toIndex);
    const operation = {
      op: ARRAY_DIFF_OP.MOVE,
      originalIndex: this.originalIndexAt(fromIndex),
      from: fromIndex,
      index: toIndex,
      item: this.#array[fromIndex],
    };
    const [_item] = this.#array.splice(fromIndex, 1);
    this.#array.splice(toIndex, 0, _item);
    const [originalIndex] = this.#originalIndices.splice(fromIndex, 1);
    this.#originalIndices.splice(toIndex, 0, originalIndex);
    return operation
  }
  removeItemsAfter(index) {
    const operations = [];
    while (this.length > index) {
      operations.push(this.removeItem(index));
    }
    return operations
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message)
  }
}

const DOM_TYPES = {
  TEXT: 'text',
  ELEMENT: 'element',
  FRAGMENT: 'fragment',
  COMPONENT: 'component',
  SLOT: 'slot',
};
function h(tag, props = {}, children = []) {
  const type =
    typeof tag === 'string' ? DOM_TYPES.ELEMENT : DOM_TYPES.COMPONENT;
  assert(
    typeof props === 'object' && !Array.isArray(props),
    '[vdom] h() expects an object as props (2nd argument)'
  );
  assert(
    Array.isArray(children),
    `[vdom] h() expects an array of children (3rd argument), but got '${typeof children}'`
  );
  return {
    tag,
    props,
    type,
    children: mapTextNodes(withoutNulls(children)),
  }
}
function isComponent({ tag }) {
  return typeof tag === 'function'
}
function hString(str) {
  return { type: DOM_TYPES.TEXT, value: String(str) }
}
function hFragment(vNodes) {
  assert(
    Array.isArray(vNodes),
    '[vdom] hFragment() expects an array of vNodes'
  );
  return {
    type: DOM_TYPES.FRAGMENT,
    children: mapTextNodes(withoutNulls(vNodes)),
  }
}
let hSlotCalled = false;
function didCreateSlot() {
  return hSlotCalled
}
function resetDidCreateSlot() {
  hSlotCalled = false;
}
function hSlot(children = []) {
  hSlotCalled = true;
  return { type: DOM_TYPES.SLOT, children }
}
function mapTextNodes(children) {
  return children.map((child) =>
    typeof child === 'string' ||
    typeof child === 'number' ||
    typeof child === 'boolean' ||
    typeof child === 'bigint' ||
    typeof child === 'symbol'
      ? hString(child)
      : child
  )
}
function extractChildren(vdom) {
  if (vdom.children == null) {
    return []
  }
  const children = [];
  for (const child of vdom.children) {
    if (child.type === DOM_TYPES.FRAGMENT) {
      children.push(...extractChildren(child));
    } else {
      children.push(child);
    }
  }
  return children
}

let isScheduled = false;
const jobs = [];
function enqueueJob(job) {
  jobs.push(job);
  scheduleUpdate();
}
function scheduleUpdate() {
  if (isScheduled) return
  isScheduled = true;
  queueMicrotask(processJobs);
}
function processJobs() {
  while (jobs.length > 0) {
    const job = jobs.shift();
    const result = job();
    Promise.resolve(result).then(
      () => {
      },
      (error) => {
        console.error(`[scheduler]: ${error}`);
      }
    );
  }
  isScheduled = false;
}
function nextTick() {
  scheduleUpdate();
  return flushPromises()
}
function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve))
}

function destroyDOM(vdom) {
  const { type } = vdom;
  switch (type) {
    case DOM_TYPES.TEXT: {
      removeTextNode(vdom);
      break
    }
    case DOM_TYPES.ELEMENT: {
      removeElementNode(vdom);
      break
    }
    case DOM_TYPES.FRAGMENT: {
      removeFragmentNodes(vdom);
      break
    }
    case DOM_TYPES.COMPONENT: {
      vdom.component.unmount();
      enqueueJob(() => vdom.component.onUnmounted());
      break
    }
    default: {
      throw new Error(`Can't destroy DOM of type: ${type}`)
    }
  }
  delete vdom.el;
}
function removeTextNode(vdom) {
  const { el } = vdom;
  assert(el instanceof Text);
  el.remove();
}
function removeElementNode(vdom) {
  const { el, children, listeners } = vdom;
  assert(el instanceof HTMLElement);
  el.remove();
  children.forEach(destroyDOM);
  if (listeners) {
    removeEventListeners(listeners, el);
    delete vdom.listeners;
  }
}
function removeFragmentNodes(vdom) {
  const { children } = vdom;
  children.forEach(destroyDOM);
}

function setAttributes(el, attrs) {
  const { class: className, style, ...otherAttrs } = attrs;
  delete otherAttrs.key;
  if (className) {
    setClass(el, className);
  }
  if (style) {
    Object.entries(style).forEach(([prop, value]) => {
      setStyle(el, prop, value);
    });
  }
  for (const [name, value] of Object.entries(otherAttrs)) {
    setAttribute(el, name, value);
  }
}
function setAttribute(el, name, value) {
  if (value == null) {
    removeAttribute(el, name);
  } else if (name.startsWith('data-')) {
    el.setAttribute(name, value);
  } else {
    el[name] = value;
  }
}
function removeAttribute(el, name) {
  try {
    el[name] = null;
  } catch {
    console.warn(`Failed to set "${name}" to null on ${el.tagName}`);
  }
  el.removeAttribute(name);
}
function setStyle(el, name, value) {
  el.style[name] = value;
}
function removeStyle(el, name) {
  el.style[name] = null;
}
function setClass(el, className) {
  el.className = '';
  if (typeof className === 'string') {
    el.className = className;
  }
  if (Array.isArray(className)) {
    el.classList.add(...className);
  }
}

function extractPropsAndEvents(vdom) {
  const { on: events = {}, ...props } = vdom.props;
  delete props.key;
  return { props, events }
}

function mountDOM(vdom, parentEl, index, hostComponent = null) {
  if (parentEl == null) {
    throw new Error('[mountDOM] Parent element is null')
  }
  switch (vdom.type) {
    case DOM_TYPES.TEXT: {
      createTextNode(vdom, parentEl, index);
      break
    }
    case DOM_TYPES.ELEMENT: {
      createElementNode(vdom, parentEl, index, hostComponent);
      break
    }
    case DOM_TYPES.FRAGMENT: {
      createFragmentNodes(vdom, parentEl, index, hostComponent);
      break
    }
    case DOM_TYPES.COMPONENT: {
      createComponentNode(vdom, parentEl, index, hostComponent);
      enqueueJob(() => vdom.component.onMounted());
      break
    }
    default: {
      throw new Error(`Can't mount DOM of type: ${vdom.type}`)
    }
  }
}
function createTextNode(vdom, parentEl, index) {
  const { value } = vdom;
  const textNode = document.createTextNode(value);
  vdom.el = textNode;
  insert(textNode, parentEl, index);
}
function createElementNode(vdom, parentEl, index, hostComponent) {
  const { tag, children } = vdom;
  const element = document.createElement(tag);
  addProps(element, vdom, hostComponent);
  vdom.el = element;
  children.forEach((child) => mountDOM(child, element, null, hostComponent));
  insert(element, parentEl, index);
}
function addProps(el, vdom, hostComponent) {
  const { props: attrs, events } = extractPropsAndEvents(vdom);
  vdom.listeners = addEventListeners(events, el, hostComponent);
  setAttributes(el, attrs);
}
function createFragmentNodes(vdom, parentEl, index, hostComponent) {
  const { children } = vdom;
  vdom.el = parentEl;
  for (const child of children) {
    mountDOM(child, parentEl, index, hostComponent);
    if (index == null) {
      continue
    }
    switch (child.type) {
      case DOM_TYPES.FRAGMENT:
        index += child.children.length;
        break
      case DOM_TYPES.COMPONENT:
        index += child.component.elements.length;
        break
      default:
        index++;
    }
  }
}
function createComponentNode(vdom, parentEl, index, hostComponent) {
  const { tag: Component, children } = vdom;
  const { props, events } = extractPropsAndEvents(vdom);
  const component = new Component(props, events, hostComponent);
  component.setExternalContent(children);
  component.setAppContext(hostComponent?.appContext ?? {});
  component.mount(parentEl, index);
  vdom.component = component;
  vdom.el = component.firstElement;
}
function insert(el, parentEl, index) {
  if (index == null) {
    parentEl.append(el);
    return
  }
  if (index < 0) {
    throw new Error(`Index must be a positive integer, got ${index}`)
  }
  const children = parentEl.childNodes;
  if (index >= children.length) {
    parentEl.append(el);
  } else {
    parentEl.insertBefore(el, children[index]);
  }
}

class Dispatcher {
  #subs = new Map()
  #afterHandlers = []
  subscribe(commandName, handler) {
    if (!this.#subs.has(commandName)) {
      this.#subs.set(commandName, []);
    }
    const handlers = this.#subs.get(commandName);
    if (handlers.includes(handler)) {
      return () => {}
    }
    handlers.push(handler);
    return () => {
      const idx = handlers.indexOf(handler);
      handlers.splice(idx, 1);
    }
  }
  afterEveryCommand(handler) {
    this.#afterHandlers.push(handler);
    return () => {
      const idx = this.#afterHandlers.indexOf(handler);
      this.#afterHandlers.splice(idx, 1);
    }
  }
  dispatch(commandName, payload) {
    if (this.#subs.has(commandName)) {
      this.#subs.get(commandName).forEach((handler) => handler(payload));
    } else {
      console.warn(`No handlers for command: ${commandName}`);
    }
    this.#afterHandlers.forEach((handler) => handler());
  }
}

function isNotEmptyString(str) {
  return str !== ''
}
function isNotBlankOrEmptyString(str) {
  return isNotEmptyString(str.trim())
}

const CATCH_ALL_ROUTE = '*';
function validateRoute(route) {
  if (typeof route.path !== 'string') {
    throw new Error('Route path must be a string')
  }
  if (isNotBlankOrEmptyString(route.path) === false) {
    throw new Error('Route path must not be empty')
  }
  if (route.path[0] !== '/' && route.path !== CATCH_ALL_ROUTE) {
    throw new Error(
      'Route path must start with a "/" or be the catch-all route "*"'
    )
  }
  if (route.redirect && route.path === route.redirect) {
    throw new Error("A redirect route can't redirect to itself")
  }
}
function makeRouteMatcher(route) {
  validateRoute(route);
  return routeHasParams(route)
    ? makeMatcherWithParams(route)
    : makeMatcherWithoutParams(route)
}
function routeHasParams({ path }) {
  return path.includes(':')
}
function makeMatcherWithParams(route) {
  const regex = makeRouteWithParamsRegex(route);
  const isRedirect = typeof route.redirect === 'string';
  return {
    route,
    isRedirect,
    checkMatch(path) {
      return regex.test(path)
    },
    extractParams(path) {
      const { groups } = regex.exec(path);
      return groups
    },
    extractQuery,
  }
}
function makeRouteWithParamsRegex({ path }) {
  const regex = path.replace(
    /:([^/]+)/g,
    (_, paramName) => `(?<${paramName}>[^/]+)`
  );
  return new RegExp(`^${regex}$`)
}
function makeMatcherWithoutParams(route) {
  const regex = makeRouteWithoutParamsRegex(route);
  const isRedirect = typeof route.redirect === 'string';
  return {
    route,
    isRedirect,
    checkMatch(path) {
      return regex.test(path)
    },
    extractParams() {
      return {}
    },
    extractQuery,
  }
}
function makeRouteWithoutParamsRegex({ path }) {
  if (path === CATCH_ALL_ROUTE) {
    return new RegExp('^.*$')
  }
  return new RegExp(`^${path}$`)
}
function extractQuery(path) {
  const queryIndex = path.indexOf('?');
  if (queryIndex === -1) {
    return {}
  }
  const search = new URLSearchParams(path.slice(queryIndex + 1));
  return Object.fromEntries(search.entries())
}

const ROUTER_EVENT = 'router-event';
class HashRouter {
  #isInitialized = false
  #matchers = []
  #matchedRoute = null
  #dispatcher = new Dispatcher()
  #subscriptions = new WeakMap()
  #subscriberFns = new Set()
  get matchedRoute() {
    return this.#matchedRoute
  }
  #params = {}
  get params() {
    return this.#params
  }
  #query = {}
  get query() {
    return this.#query
  }
  get #currentRouteHash() {
    const hash = document.location.hash;
    if (hash === '') {
      return '/'
    }
    return hash.slice(1)
  }
  #onPopState = () => this.#matchCurrentRoute()
  constructor(routes = []) {
    assert(Array.isArray(routes), 'Routes must be an array');
    this.#matchers = routes.map(makeRouteMatcher);
  }
  async init() {
    if (this.#isInitialized) {
      return
    }
    if (document.location.hash === '') {
      window.history.replaceState({}, '', '#/');
    }
    window.addEventListener('popstate', this.#onPopState);
    await this.#matchCurrentRoute();
    this.#isInitialized = true;
  }
  destroy() {
    if (!this.#isInitialized) {
      return
    }
    window.removeEventListener('popstate', this.#onPopState);
    Array.from(this.#subscriberFns).forEach(this.unsubscribe, this);
    this.#isInitialized = false;
  }
  async navigateTo(path) {
    const matcher = this.#matchers.find((matcher) =>
      matcher.checkMatch(path)
    );
    if (matcher == null) {
      console.warn(`[Router] No route matches path "${path}"`);
      this.#matchedRoute = null;
      this.#params = {};
      this.#query = {};
      return
    }
    if (matcher.isRedirect) {
      return this.navigateTo(matcher.route.redirect)
    }
    const from = this.#matchedRoute;
    const to = matcher.route;
    const { shouldNavigate, shouldRedirect, redirectPath } =
      await this.#canChangeRoute(from, to);
    if (shouldRedirect) {
      return this.navigateTo(redirectPath)
    }
    if (shouldNavigate) {
      this.#matchedRoute = matcher.route;
      this.#params = matcher.extractParams(path);
      this.#query = matcher.extractQuery(path);
      this.#pushState(path);
      this.#dispatcher.dispatch(ROUTER_EVENT, { from, to, router: this });
    }
  }
  back() {
    window.history.back();
  }
  forward() {
    window.history.forward();
  }
  subscribe(handler) {
    const unsubscribe = this.#dispatcher.subscribe(ROUTER_EVENT, handler);
    this.#subscriptions.set(handler, unsubscribe);
    this.#subscriberFns.add(handler);
  }
  unsubscribe(handler) {
    const unsubscribe = this.#subscriptions.get(handler);
    if (unsubscribe) {
      unsubscribe();
      this.#subscriptions.delete(handler);
      this.#subscriberFns.delete(handler);
    }
  }
  #pushState(path) {
    window.history.pushState({}, '', `#${path}`);
  }
  #matchCurrentRoute() {
    return this.navigateTo(this.#currentRouteHash)
  }
  async #canChangeRoute(from, to) {
    const guard = to.beforeEnter;
    if (typeof guard !== 'function') {
      return {
        shouldRedirect: false,
        shouldNavigate: true,
        redirectPath: null,
      }
    }
    const result = await guard(from?.path, to?.path);
    if (result === false) {
      return {
        shouldRedirect: false,
        shouldNavigate: false,
        redirectPath: null,
      }
    }
    if (typeof result === 'string') {
      return {
        shouldRedirect: true,
        shouldNavigate: false,
        redirectPath: result,
      }
    }
    return {
      shouldRedirect: false,
      shouldNavigate: true,
      redirectPath: null,
    }
  }
}
class NoopRouter {
  init() {}
  destroy() {}
  navigateTo() {}
  back() {}
  forward() {}
  subscribe() {}
  unsubscribe() {}
}

function createApp(RootComponent, props = {}, options = {}) {
  let parentEl = null;
  let isMounted = false;
  let vdom = null;
  const context = {
    router: options.router || new NoopRouter(),
  };
  function reset() {
    parentEl = null;
    isMounted = false;
    vdom = null;
  }
  return {
    mount(_parentEl) {
      if (isMounted) {
        throw new Error('The application is already mounted')
      }
      parentEl = _parentEl;
      vdom = h(RootComponent, props);
      mountDOM(vdom, parentEl, null, { appContext: context });
      context.router.init();
      isMounted = true;
    },
    unmount() {
      if (!isMounted) {
        throw new Error('The application is not mounted')
      }
      destroyDOM(vdom);
      context.router.destroy();
      reset();
    },
  }
}

function areNodesEqual(nodeOne, nodeTwo) {
  if (nodeOne.type !== nodeTwo.type) {
    return false
  }
  if (nodeOne.type === DOM_TYPES.ELEMENT) {
    const {
      tag: tagOne,
      props: { key: keyOne },
    } = nodeOne;
    const {
      tag: tagTwo,
      props: { key: keyTwo },
    } = nodeTwo;
    return tagOne === tagTwo && keyOne === keyTwo
  }
  if (nodeOne.type === DOM_TYPES.COMPONENT) {
    const {
      tag: componentOne,
      props: { key: keyOne },
    } = nodeOne;
    const {
      tag: componentTwo,
      props: { key: keyTwo },
    } = nodeTwo;
    return componentOne === componentTwo && keyOne === keyTwo
  }
  return true
}

function objectsDiff(oldObj, newObj) {
  const oldKeys = Object.keys(oldObj);
  const newKeys = Object.keys(newObj);
  return {
    added: newKeys.filter((key) => !(key in oldObj)),
    removed: oldKeys.filter((key) => !(key in newObj)),
    updated: newKeys.filter(
      (key) => key in oldObj && oldObj[key] !== newObj[key]
    ),
  }
}
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop)
}

function patchDOM(oldVdom, newVdom, parentEl, hostComponent = null) {
  if (!areNodesEqual(oldVdom, newVdom)) {
    const index = findIndexInParent(parentEl, oldVdom.el);
    destroyDOM(oldVdom);
    mountDOM(newVdom, parentEl, index, hostComponent);
    return newVdom
  }
  newVdom.el = oldVdom.el;
  switch (newVdom.type) {
    case DOM_TYPES.TEXT: {
      patchText(oldVdom, newVdom);
      return newVdom
    }
    case DOM_TYPES.ELEMENT: {
      patchElement(oldVdom, newVdom, hostComponent);
      break
    }
    case DOM_TYPES.COMPONENT: {
      patchComponent(oldVdom, newVdom);
      break
    }
  }
  patchChildren(oldVdom, newVdom, hostComponent);
  return newVdom
}
function findIndexInParent(parentEl, el) {
  const index = Array.from(parentEl.childNodes).indexOf(el);
  if (index < 0) {
    return null
  }
  return index
}
function patchText(oldVdom, newVdom) {
  const el = oldVdom.el;
  const { value: oldText } = oldVdom;
  const { value: newText } = newVdom;
  if (oldText !== newText) {
    el.nodeValue = newText;
  }
}
function patchElement(oldVdom, newVdom, hostComponent) {
  const el = oldVdom.el;
  const {
    class: oldClass,
    style: oldStyle,
    on: oldEvents,
    ...oldAttrs
  } = oldVdom.props;
  const {
    class: newClass,
    style: newStyle,
    on: newEvents,
    ...newAttrs
  } = newVdom.props;
  const { listeners: oldListeners } = oldVdom;
  patchAttrs(el, oldAttrs, newAttrs);
  patchClasses(el, oldClass, newClass);
  patchStyles(el, oldStyle, newStyle);
  newVdom.listeners = patchEvents(
    el,
    oldListeners,
    oldEvents,
    newEvents,
    hostComponent
  );
}
function patchAttrs(el, oldAttrs, newAttrs) {
  const { added, removed, updated } = objectsDiff(oldAttrs, newAttrs);
  for (const attr of removed) {
    removeAttribute(el, attr);
  }
  for (const attr of added.concat(updated)) {
    setAttribute(el, attr, newAttrs[attr]);
  }
}
function patchClasses(el, oldClass, newClass) {
  const oldClasses = toClassList(oldClass);
  const newClasses = toClassList(newClass);
  const { added, removed } = arraysDiff(oldClasses, newClasses);
  if (removed.length > 0) {
    el.classList.remove(...removed);
  }
  if (added.length > 0) {
    el.classList.add(...added);
  }
}
function toClassList(classes = '') {
  return Array.isArray(classes)
    ? classes.filter(isNotBlankOrEmptyString)
    : classes.split(/(\s+)/).filter(isNotBlankOrEmptyString)
}
function patchStyles(el, oldStyle = {}, newStyle = {}) {
  const { added, removed, updated } = objectsDiff(oldStyle, newStyle);
  for (const style of removed) {
    removeStyle(el, style);
  }
  for (const style of added.concat(updated)) {
    setStyle(el, style, newStyle[style]);
  }
}
function patchEvents(
  el,
  oldListeners = {},
  oldEvents = {},
  newEvents = {},
  hostComponent
) {
  const { removed, added, updated } = objectsDiff(oldEvents, newEvents);
  const listeners = { ...oldListeners };
  for (const eventName of removed.concat(updated)) {
    el.removeEventListener(eventName, oldListeners[eventName]);
    delete listeners[eventName];
  }
  for (const eventName of added.concat(updated)) {
    const listener = addEventListener(
      eventName,
      newEvents[eventName],
      el,
      hostComponent
    );
    listeners[eventName] = listener;
  }
  return listeners
}
function patchComponent(oldVdom, newVdom) {
  const { component } = oldVdom;
  const { children } = newVdom;
  const { props } = extractPropsAndEvents(newVdom);
  component.setExternalContent(children);
  component.updateProps(props);
  newVdom.component = component;
  newVdom.el = component.firstElement;
}
function patchChildren(oldVdom, newVdom, hostComponent) {
  const oldChildren = extractChildren(oldVdom);
  const newChildren = extractChildren(newVdom);
  const parentEl = oldVdom.el;
  const diffSeq = arraysDiffSequence(
    oldChildren,
    newChildren,
    areNodesEqual
  );
  for (const operation of diffSeq) {
    const { originalIndex, index, item } = operation;
    const offset = computeChildrenOffset(oldVdom, hostComponent);
    switch (operation.op) {
      case ARRAY_DIFF_OP.ADD: {
        mountDOM(item, parentEl, index + offset, hostComponent);
        break
      }
      case ARRAY_DIFF_OP.REMOVE: {
        destroyDOM(item);
        break
      }
      case ARRAY_DIFF_OP.MOVE: {
        const oldChild = oldChildren[originalIndex];
        const newChild = newChildren[index];
        const elAtTargetIndex = parentEl.childNodes[index + offset];
        const elementsToMove = isComponent(oldChild)
          ? oldChild.component.elements
          : [oldChild.el];
        elementsToMove.forEach((el) => {
          parentEl.insertBefore(el, elAtTargetIndex);
          patchDOM(oldChild, newChild, parentEl, hostComponent);
        });
        break
      }
      case ARRAY_DIFF_OP.NOOP: {
        patchDOM(
          oldChildren[originalIndex],
          newChildren[index],
          parentEl,
          hostComponent
        );
        break
      }
    }
  }
}
function computeChildrenOffset(oldVdom, hostComponent = null) {
  if (hostComponent == null) {
    return 0
  }
  if (oldVdom.el === hostComponent.hostEl) {
    return hostComponent.offset
  }
  return 0
}

function traverseDFS(
  vdom,
  processNode,
  shouldSkipBranch = () => false,
  parentNode = null,
  index = null
) {
  if (shouldSkipBranch(vdom)) return
  processNode(vdom, parentNode, index);
  if (vdom.children) {
    vdom.children.forEach((child, i) =>
      traverseDFS(child, processNode, shouldSkipBranch, vdom, i)
    );
  }
}

function fillSlots(vdom, externalContent = []) {
  function processNode(node, parent, index) {
    insertViewInSlot(node, parent, index, externalContent);
  }
  traverseDFS(vdom, processNode, shouldSkipBranch);
}
function insertViewInSlot(node, parent, index, externalContent) {
  if (node.type !== DOM_TYPES.SLOT) return
  assert(parent !== null, 'Slot nodes must have a parent');
  assert(index !== null, 'Slot nodes must have an index');
  const defaultContent = node.children;
  const views =
    externalContent.length > 0 ? externalContent : defaultContent;
  assert(Array.isArray(views), 'Slot views must be an array');
  const hasContent = views.length > 0;
  if (hasContent) {
    parent.children.splice(index, 1, hFragment(views));
  } else {
    parent.children.splice(index, 1);
  }
}
function shouldSkipBranch(node) {
  return node.type === DOM_TYPES.COMPONENT
}

const emptyFn = () => { };
function defineComponent({
  render,
  state,
  onMounted = emptyFn,
  onUnmounted = emptyFn,
  ...methods
}) {
  class Component {
    #isMounted = false
    #vdom = null
    #hostEl = null
    #eventHandlers = null
    #parentComponent = null
    #dispatcher = new Dispatcher()
    #subscriptions = []
    #appContext = null
    #children = []
    constructor(props = {}, eventHandlers = {}, parentComponent = null) {
      this.props = props;
      this.state = state ? state(props) : {};
      this.#eventHandlers = eventHandlers;
      this.#parentComponent = parentComponent;
    }
    onMounted() {
      return Promise.resolve(onMounted.call(this))
    }
    onUnmounted() {
      return Promise.resolve(onUnmounted.call(this))
    }
    setAppContext(appContext) {
      this.#appContext = appContext;
    }
    get appContext() {
      return this.#appContext
    }
    get parentComponent() {
      return this.#parentComponent
    }
    get vdom() {
      return this.#vdom
    }
    get elements() {
      if (this.#vdom == null) {
        return []
      }
      if (this.#vdom.type === DOM_TYPES.FRAGMENT) {
        return extractChildren(this.#vdom).flatMap((child) => {
          if (child.type === DOM_TYPES.COMPONENT) {
            return child.component.elements
          }
          return [child.el]
        })
      }
      return [this.#vdom.el]
    }
    get firstElement() {
      return this.elements[0]
    }
    get offset() {
      if (this.#vdom.type === DOM_TYPES.FRAGMENT) {
        return Array.from(this.#hostEl.children).indexOf(this.firstElement)
      }
      return 0
    }
    get hostEl() {
      if (!this.#isMounted) {
        throw new Error(`Cannot get host element of unmounted component`)
      }
      return this.#hostEl
    }
    updateProps(props) {
      this.props = { ...this.props, ...props };
      this.#patch();
    }
    updateState(state) {
      this.state = { ...this.state, ...state };
      this.#patch();
    }
    setExternalContent(children) {
      this.#children = children;
    }
    render() {
      const vdom = render.call(this);
      if (didCreateSlot()) {
        fillSlots(vdom, this.#children);
        resetDidCreateSlot();
      }
      return vdom
    }
    mount(hostEl, index = null) {
      if (this.#isMounted) {
        throw new Error('Component is already mounted')
      }
      this.#vdom = this.render();
      mountDOM(this.#vdom, hostEl, index, this);
      this.#wireEventHandlers();
      this.#isMounted = true;
      this.#hostEl = hostEl;
    }
    #wireEventHandlers() {
      this.#subscriptions = Object.entries(this.#eventHandlers).map(
        ([eventName, handler]) => this.#wireEventHandler(eventName, handler)
      );
    }
    #wireEventHandler(eventName, handler) {
      return this.#dispatcher.subscribe(eventName, (payload) => {
        if (this.#parentComponent) {
          handler.call(this.#parentComponent, payload);
        } else {
          handler(payload);
        }
      })
    }
    unmount() {
      if (!this.#isMounted) {
        throw new Error('Component is not mounted')
      }
      destroyDOM(this.#vdom);
      this.#subscriptions.forEach((unsubscribe) => unsubscribe());
      this.#vdom = null;
      this.#isMounted = false;
      this.#hostEl = null;
      this.#subscriptions = [];
    }
    emit(eventName, payload) {
      this.#dispatcher.dispatch(eventName, payload);
    }
    #patch() {
      if (!this.#isMounted) {
        throw new Error('Component is not mounted')
      }
      const vdom = this.render();
      this.#vdom = patchDOM(this.#vdom, vdom, this.#hostEl, this);
    }
  }
  for (const methodName in methods) {
    if (hasOwnProperty(Component, methodName)) {
      throw new Error(
        `Method "${methodName}()" already exists in the component. Can't override existing methods.`
      )
    }
    Component.prototype[methodName] = methods[methodName];
  }
  return Component
}

const RouterOutlet = defineComponent({
  state() {
    return {
      matchedRoute: null,
      subscription: null,
    }
  },
  onMounted() {
    const subscription = this.appContext.router.subscribe(({ to }) => {
      this.handleRouteChange(to);
    });
    this.updateState({ subscription });
  },
  onUnmounted() {
    const { subscription } = this.state;
    this.appContext.router.unsubscribe(subscription);
  },
  handleRouteChange(matchedRoute) {
    this.updateState({ matchedRoute });
  },
  render() {
    const { matchedRoute } = this.state;
    return h('div', { id: 'router-outlet' }, [
      matchedRoute ? h(matchedRoute.component) : null,
    ])
  },
});
const RouterLink = defineComponent({
  render() {
    const { to } = this.props;
    return h(
      'a',
      {
        href: to,
        on: {
          click: (e) => {
            e.preventDefault();
            this.appContext.router.navigateTo(to);
          },
        },
      },
      [hSlot()]
    )
  },
});

export { DOM_TYPES, HashRouter, RouterLink, RouterOutlet, createApp, defineComponent, h, hFragment, hSlot, hString, nextTick };
