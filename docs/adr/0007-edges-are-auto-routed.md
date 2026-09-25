# Edges are auto-routed; players never place bends

When the player drags from an output connector to an input connector, the edge follows the shortest orthogonal grid path that avoids nodes, water and other edges, with a deterministic tie-break. There is no gesture to place or drag bends. To change a route, the player removes and recreates the edge or moves nodes, and moving a node re-routes every attached edge (the move is refused if any edge would end up with no route or too long). When a new or re-routed edge finds no route within its length limit, the existing edges in its way step aside: they are lifted, the edge is routed, and they are routed again in id order. The change stands only if every edge ends up with a planar route within its limit, and its undo puts them back (playtest feedback, issue #81).

On real phones, a touch prototype compared three schemes: hold 300 ms to pin a bend, automatic routing, and tap by tap. Automatic routing won. The planar rule stays the challenge through where nodes are placed, not through fiddly path editing. Do not add manual bend editing without re-testing on touch.


Rails follow the same rule (wayfinder #8). Dragging from one Station end to another auto-routes the double track (8 directions). The player chooses only which platform end to leave from and which to arrive at. In the rail touch prototype, auto-routing beat hand-drawn rail and one-tap direct lines.
