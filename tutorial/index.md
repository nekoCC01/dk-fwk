# src

_Lens: beginner-tutorial_

This project is a small component-based frontend framework with its own virtual DOM, diffing algorithm, and router. You build apps by defining components, returning virtual DOM trees from their render functions, and letting the framework mount, update, and unmount them efficiently in the browser.


## Architecture

```mermaid
flowchart TD
    A0["VNode / DOM_TYPES"]
    A1["h / hString / hFragment / hSlot"]
    A2["defineComponent / Component"]
    A3["createApp / Application context"]
    A4["mountDOM / destroyDOM / patchDOM"]
    A5["Dispatcher and component events (emit)"]
    A6["Slots and fillSlots"]
    A7["HashRouter / RouterLink / RouterOutlet"]
    A8["Scheduler / nextTick"]
    A9["RouteMatcher / validateRoute"]
    A3 -- "instantiates root component cl" --> A2
    A3 -- "creates root VNode for mountin" --> A0
    A3 -- "delegates root DOM mounting an" --> A4
    A3 -- "injects router instance into a" --> A7
    A0 -- "drives how DOM and components " --> A4
    A0 -- "is produced by helper creation" --> A1
    A0 -- "includes SLOT nodes that are l" --> A6
    A1 -- "builds typed virtual nodes" --> A0
    A1 -- "is used inside render function" --> A2
    A2 -- "produces VNode trees via rende" --> A0
    A2 -- "calls DOM functions to mount a" --> A4
    A2 -- "wraps dispatcher for child-to-" --> A5
    A2 -- "calls fillSlots to resolve slo" --> A6
    A2 -- "reads shared appContext (e.g. " --> A3
    A4 -- "branches behavior based on VNo" --> A0
    A4 -- "creates, mounts, patches, and " --> A2
    A4 -- "schedules lifecycle jobs throu" --> A8
    A5 -- "is embedded in each component " --> A2
    A6 -- "is invoked during component re" --> A2
    A7 -- "builds matchers from validated" --> A9
    A7 -- "is provided to app and accesse" --> A3
    A7 -- "is consumed via router-aware c" --> A2
    A7 -- "uses internal dispatcher to no" --> A5
    A8 -- "runs lifecycle-related jobs en" --> A4
    A8 -- "indirectly orders lifecycle ho" --> A2
    A9 -- "powers route matching, params," --> A7
```

## Chapters

- [VNode / DOM_TYPES](01_vnode_dom_types.md)
- [h / hString / hFragment / hSlot](02_h_hstring_hfragment_hslot.md)
- [defineComponent / Component](03_definecomponent_component.md)
- [mountDOM / destroyDOM / patchDOM](04_mountdom_destroydom_patchdom.md)
- [Dispatcher and component events (emit)](05_dispatcher_and_component_events_emit.md)
- [Slots and fillSlots](06_slots_and_fillslots.md)
- [HashRouter / RouterLink / RouterOutlet](07_hashrouter_routerlink_routeroutlet.md)
- [RouteMatcher / validateRoute](08_routematcher_validateroute.md)
- [Scheduler / nextTick](09_scheduler_nexttick.md)
- [createApp / Application context](10_createapp_application_context.md)