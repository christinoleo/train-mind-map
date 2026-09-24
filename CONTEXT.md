# train-mind-map

A factory builder in which the player draws a factory as a node graph on a 2D resource map, where edges may never cross. A separate rail layer carries batches of items over long distances.

## Language

### Factory layer

**Node**:
A placed building card in the factory graph. It has input connectors on the left and output connectors on the right.
_Avoid_: building, block, machine

**Edge**:
A directed, automatically routed polyline from one node's output connector to another node's input connector. It carries items and power at a limited throughput and may never cross another edge, a node or water.
_Avoid_: belt, wire, link, connection

**Connector**:
An input or output port on a node where an edge attaches.
_Avoid_: socket, pin, port

**Bend**:
A cell where an edge's automatic route changes direction. Players never place bends directly.
_Avoid_: waypoint, corner

**Planar rule**:
The invariant that no two edges cross, and no edge passes through a node or over water.
_Avoid_: no-crossing rule

**Deposit**:
An infinite patch of one raw resource on the map, which an Extractor or a manual tap draws from.
_Avoid_: ore field, resource patch

**Scenario**:
A fixed set of placements (deposits, lakes, corridors) stamped over the seed-generated terrain to guarantee a designed layout, such as the MVP map.
_Avoid_: level, preset map

**Core**:
The indestructible starting node. It acts as the first Box, receives manual taps and gives a small free power supply.
_Avoid_: HQ, base, hub

**Box**:
A storage node. Its contents count toward the global stock.
_Avoid_: chest, container, warehouse

**Global stock**:
The sum of everything held in the Core and in all Boxes. Construction draws from it automatically.
_Avoid_: inventory

**Mesh**:
A connected group of nodes, joined by edges or by the rail network, that shares one power supply.
_Avoid_: grid, power network

**Stamina**:
The limited pool of manual taps, which refills over time.
_Avoid_: energy (reserved for power)

### Rail layer

**Rail**:
A double-track, automatically routed line on the rail layer between two Station ends, with one track in each direction. It may pass over edges but not through nodes, except a Station.
_Avoid_: track, railway (for a single piece)

**Crossing**:
The point where two rails intersect. It is either an **X** (trains go straight; drawn as rails passing over each other) or an **Interchange** (trains may switch rails; drawn as a small rail roundabout).
_Avoid_: junction (reserved for Y), intersection

**Junction**:
A Y where one rail splits into two.
_Avoid_: switch, fork

**Segment**:
A stretch of track between two interconnections. It is the unit a train reserves before entering.
_Avoid_: block

**Station**:
The only node present on both layers. It buffers items between edges and trains.
_Avoid_: stop, depot (Depot is a distinct station kind)

**Depot**:
A Station without cargo, where idle trains wait.
_Avoid_: yard, garage

**Line**:
A fixed ordered list of stops, each with a departure condition, that a train follows.
_Avoid_: route, schedule

**Batch**:
The load a train carries in one trip, set by its number of wagons.
_Avoid_: bundle, shipment

**Dispatcher**:
The late-game system that matches Station requests with suppliers and sends idle trains.
_Avoid_: LTN, logistics network
